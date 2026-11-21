import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay } from "./backoff";
import { closedCandles, mergeCandle, mergeCandles } from "./candles";
import { ClockSync } from "./clock";
import { assetCtxWireSchema, bboWireSchema, candleSnapshotSchema, isSaneCandle, toAssetContext, toCandle, toQuote } from "./hyperliquid/schemas";
import { MultiplexSocket, routeKeyFor } from "./hyperliquid/socket";
import { HyperliquidAdapter } from "./hyperliquid/adapter";
import type { Candle } from "./types";

const c = (time: number, close: number, closeTime = time + 59_999): Candle => ({
  time,
  closeTime,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1,
  trades: 1,
});

describe("candle merging", () => {
  it("replaces the forming bar, appends new bars, and inserts older ones in order", () => {
    let arr = [c(0, 10), c(60_000, 11)];
    arr = mergeCandle(arr, c(60_000, 12));
    expect(arr.map((x) => x.close)).toEqual([10, 12]);
    arr = mergeCandle(arr, c(120_000, 13));
    expect(arr.map((x) => x.time)).toEqual([0, 60_000, 120_000]);
    const gap = mergeCandle([c(0, 1), c(120_000, 3)], c(60_000, 2));
    expect(gap.map((x) => x.close)).toEqual([1, 2, 3]);
  });

  it("returns the same reference when nothing changed", () => {
    const arr = [c(0, 10)];
    expect(mergeCandle(arr, c(0, 10))).toBe(arr);
  });

  it("batch merge lets incoming bars win and keeps sort order", () => {
    const out = mergeCandles([c(0, 1), c(60_000, 2)], [c(60_000, 5), c(120_000, 6)]);
    expect(out.map((x) => [x.time, x.close])).toEqual([
      [0, 1],
      [60_000, 5],
      [120_000, 6],
    ]);
  });

  it("closedCandles excludes the forming bar", () => {
    const arr = [c(0, 1), c(60_000, 2)];
    expect(closedCandles(arr, 70_000)).toHaveLength(1);
    expect(closedCandles(arr, 120_000)).toHaveLength(2);
    expect(closedCandles(arr, 119_999)).toHaveLength(1);
  });
});

describe("backoff", () => {
  it("grows exponentially with jitter and caps", () => {
    expect(backoffDelay(0, 1000, 30_000, () => 0)).toBe(500);
    expect(backoffDelay(0, 1000, 30_000, () => 1)).toBe(1000);
    expect(backoffDelay(3, 1000, 30_000, () => 0.5)).toBe(6000);
    expect(backoffDelay(50, 1000, 30_000, () => 1)).toBe(30_000);
  });
});

describe("ClockSync", () => {
  it("uses the least-latency sample", () => {
    const s = new ClockSync();
    expect(s.offset()).toBeNull();
    [120, 90, 300, 95, 100].forEach((lat) => s.add(1_000_000, 1_000_000 + lat));
    expect(s.offset()).toBe(-90);
  });
});

// Real payloads captured from api.hyperliquid.xyz on 2026-11-21.
const LIVE_CANDLE = { t: 1795286100000, T: 1795286159999, s: "BTC", i: "1m", o: "60132.0", c: "60123.0", h: "60132.0", l: "60122.0", v: "0.06112", n: 15 };
const LIVE_BBO = { coin: "BTC", time: 1795286131180, bbo: [{ px: "60120.0", sz: "6.74559", n: 16 }, { px: "60121.0", sz: "1.20758", n: 12 }] };
const LIVE_CTX = {
  coin: "BTC",
  ctx: {
    funding: "-0.0000025881", openInterest: "37601.27286", prevDayPx: "58715.0", dayNtlVlm: "6106894338.4031190872",
    premium: "-0.0005485737", oraclePx: "60156.0", markPx: "60123.0", midPx: "60122.5", impactPxs: ["60122.0", "60123.0"], dayBaseVlm: "105027.71939",
  },
};

describe("Hyperliquid wire schemas", () => {
  it("parses live candle / bbo / asset-context payloads", () => {
    const candle = toCandle(candleSnapshotSchema.parse([LIVE_CANDLE])[0]);
    expect(candle).toEqual({ time: 1795286100000, closeTime: 1795286159999, open: 60132, high: 60132, low: 60122, close: 60123, volume: 0.06112, trades: 15 });
    expect(isSaneCandle(candle)).toBe(true);

    const quote = toQuote(bboWireSchema.parse(LIVE_BBO), 5);
    expect(quote).toMatchObject({ symbol: "BTC", bid: 60120, ask: 60121, receivedAt: 5 });

    const ctx = toAssetContext(assetCtxWireSchema.parse(LIVE_CTX), 7);
    expect(ctx).toMatchObject({ symbol: "BTC", markPx: 60123, prevDayPx: 58715, funding: -0.0000025881, midPx: 60122.5 });
  });

  it("rejects malformed payloads and insane candles", () => {
    expect(candleSnapshotSchema.safeParse([{ ...LIVE_CANDLE, o: "abc" }]).success).toBe(false);
    expect(candleSnapshotSchema.safeParse(null).success).toBe(false);
    expect(isSaneCandle({ ...toCandle(candleSnapshotSchema.parse([LIVE_CANDLE])[0]), high: 1 })).toBe(false);
    expect(toQuote(bboWireSchema.parse({ ...LIVE_BBO, bbo: [null, LIVE_BBO.bbo[1]] }), 0)).toBeNull();
  });

  it("routes messages to subscription keys", () => {
    expect(routeKeyFor("candle", LIVE_CANDLE)).toBe("candle:BTC:1m");
    expect(routeKeyFor("bbo", LIVE_BBO)).toBe("bbo:BTC");
    expect(routeKeyFor("activeAssetCtx", LIVE_CTX)).toBe("ctx:BTC");
    expect(routeKeyFor("pong", undefined)).toBeNull();
  });
});

describe("HyperliquidAdapter.fetchCandles", () => {
  const ok = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("posts a candleSnapshot request and returns validated candles", async () => {
    const fetchImpl = ok([{ ...LIVE_CANDLE, i: "15m" }]);
    const a = new HyperliquidAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch, WebSocketImpl: FakeWS as unknown as typeof WebSocket });
    const out = await a.fetchCandles("BTC", "15m", { bars: 10, endTime: 1_000_000_000 });
    expect(out).toHaveLength(1);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      type: "candleSnapshot",
      req: { coin: "BTC", interval: "15m", startTime: 1_000_000_000 - 10 * 15 * 60_000, endTime: 1_000_000_000 },
    });
    a.dispose();
  });

  it("surfaces HTTP and validation errors explicitly", async () => {
    const a = new HyperliquidAdapter({ fetchImpl: ok(null, 500) as unknown as typeof fetch, WebSocketImpl: FakeWS as unknown as typeof WebSocket });
    await expect(a.fetchCandles("BTC", "1h", { bars: 5 })).rejects.toMatchObject({ kind: "http", status: 500 });
    const b = new HyperliquidAdapter({ fetchImpl: ok({ nope: 1 }) as unknown as typeof fetch, WebSocketImpl: FakeWS as unknown as typeof WebSocket });
    await expect(b.fetchCandles("BTC", "1h", { bars: 5 })).rejects.toMatchObject({ kind: "validation" });
    await expect(b.fetchCandles("DOGE", "1h", { bars: 5 })).rejects.toMatchObject({ kind: "unsupported" });
    a.dispose();
    b.dispose();
  });
});

// ---------- MultiplexSocket with a fake WebSocket ----------

class FakeWS {
  static instances: FakeWS[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(s: string) {
    this.sent.push(JSON.parse(s));
  }
  close() {
    this.readyState = 3;
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code, reason: "" });
  }
}

describe("MultiplexSocket", () => {
  beforeEach(() => {
    FakeWS.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("subscribes on open, routes messages, reconnects with backoff and resubscribes", () => {
    const sock = new MultiplexSocket({ url: "wss://x", WebSocketImpl: FakeWS as unknown as typeof WebSocket });
    const statuses: Array<[string, number]> = [];
    sock.onStatus((e) => statuses.push([e.status, e.connectionId]));
    const got: unknown[] = [];
    const unsub = sock.subscribe("bbo:BTC", { type: "bbo", coin: "BTC" }, (d) => got.push(d));

    const ws1 = FakeWS.instances[0];
    ws1.open();
    expect(ws1.sent).toEqual([{ method: "subscribe", subscription: { type: "bbo", coin: "BTC" } }]);
    ws1.emit({ channel: "bbo", data: LIVE_BBO });
    ws1.emit({ channel: "bbo", data: { ...LIVE_BBO, coin: "ETH" } }); // not subscribed → ignored
    expect(got).toHaveLength(1);

    ws1.drop();
    expect(statuses.at(-1)?.[0]).toBe("reconnecting");
    vi.advanceTimersByTime(1000); // attempt 0 waits ≤ 1s
    const ws2 = FakeWS.instances[1];
    expect(ws2).toBeDefined();
    ws2.open();
    expect(ws2.sent).toEqual([{ method: "subscribe", subscription: { type: "bbo", coin: "BTC" } }]);
    expect(statuses.at(-1)).toEqual(["live", 2]);

    unsub();
    expect(ws2.sent.at(-1)).toEqual({ method: "unsubscribe", subscription: { type: "bbo", coin: "BTC" } });
    sock.dispose();
  });

  it("flags a silent feed as stale, then forces a reconnect", () => {
    const sock = new MultiplexSocket({
      url: "wss://x",
      WebSocketImpl: FakeWS as unknown as typeof WebSocket,
      staleAfterMs: 3000,
      deadAfterMs: 6000,
    });
    const statuses: string[] = [];
    sock.onStatus((e) => statuses.push(e.status));
    sock.subscribe("bbo:BTC", { type: "bbo", coin: "BTC" }, () => {});
    FakeWS.instances[0].open();
    vi.advanceTimersByTime(4000);
    expect(statuses.at(-1)).toBe("stale");
    vi.advanceTimersByTime(3000);
    expect(statuses).toContain("reconnecting");
    vi.advanceTimersByTime(1000);
    expect(FakeWS.instances).toHaveLength(2);
    sock.dispose();
  });

  it("sends application pings", () => {
    const sock = new MultiplexSocket({ url: "wss://x", WebSocketImpl: FakeWS as unknown as typeof WebSocket, pingIntervalMs: 1000, deadAfterMs: 1e9, staleAfterMs: 1e9 });
    sock.subscribe("bbo:BTC", { type: "bbo", coin: "BTC" }, () => {});
    FakeWS.instances[0].open();
    vi.advanceTimersByTime(2100);
    expect(FakeWS.instances[0].sent.filter((m) => (m as { method: string }).method === "ping")).toHaveLength(2);
    sock.dispose();
  });
});

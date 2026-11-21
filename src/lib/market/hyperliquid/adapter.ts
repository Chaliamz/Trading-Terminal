import {
  INTERVAL_MS,
  MarketDataError,
  type AssetContext,
  type Candle,
  type Interval,
  type MarketDataAdapter,
  type Quote,
  type StreamStatusEvent,
} from "../types";
import { HYPERLIQUID_INSTRUMENTS } from "./instruments";
import {
  assetCtxWireSchema,
  bboWireSchema,
  candleSnapshotSchema,
  candleWireSchema,
  isSaneCandle,
  toAssetContext,
  toCandle,
  toQuote,
} from "./schemas";
import { MultiplexSocket } from "./socket";

export const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
export const HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws";

/** Venue limit: candleSnapshot returns at most the 5000 most recent candles. */
const MAX_SNAPSHOT_BARS = 5000;
const REST_TIMEOUT_MS = 12_000;

export interface HyperliquidAdapterOptions {
  infoUrl?: string;
  wsUrl?: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
  onInvalidMessage?: (channel: string, issue: string) => void;
}

export class HyperliquidAdapter implements MarketDataAdapter {
  readonly id = "hyperliquid";
  readonly name = "Hyperliquid";
  readonly instruments = HYPERLIQUID_INSTRUMENTS;

  private readonly infoUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly socket: MultiplexSocket;
  private readonly onInvalid?: (channel: string, issue: string) => void;
  private timeListeners = new Set<(serverMs: number, localMs: number) => void>();

  constructor(opts: HyperliquidAdapterOptions = {}) {
    this.infoUrl = opts.infoUrl ?? HYPERLIQUID_INFO_URL;
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.onInvalid = opts.onInvalidMessage;
    this.socket = new MultiplexSocket({ url: opts.wsUrl ?? HYPERLIQUID_WS_URL, WebSocketImpl: opts.WebSocketImpl });
    this.socket.onMessage((channel, data) => {
      if (channel === "__invalid") this.onInvalid?.("ws", "unparseable message");
      else if (channel === "error") this.onInvalid?.("error", String(data).slice(0, 200));
    });
  }

  async fetchCandles(
    symbol: string,
    interval: Interval,
    opts: { bars: number; signal?: AbortSignal; endTime?: number },
  ): Promise<Candle[]> {
    this.assertSymbol(symbol);
    const bars = Math.min(MAX_SNAPSHOT_BARS, Math.max(1, Math.floor(opts.bars)));
    const endTime = opts.endTime ?? Date.now();
    const startTime = endTime - bars * INTERVAL_MS[interval];

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), REST_TIMEOUT_MS);
    const onOuterAbort = () => timeout.abort();
    opts.signal?.addEventListener("abort", onOuterAbort, { once: true });

    let res: Response;
    try {
      res = await this.fetchImpl(this.infoUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "candleSnapshot", req: { coin: symbol, interval, startTime, endTime } }),
        signal: timeout.signal,
        cache: "no-store",
      });
    } catch (err) {
      if (opts.signal?.aborted) throw new MarketDataError("Request cancelled", "aborted");
      if (timeout.signal.aborted) throw new MarketDataError(`Hyperliquid did not respond within ${REST_TIMEOUT_MS / 1000}s`, "timeout");
      throw new MarketDataError(`Network error reaching Hyperliquid: ${(err as Error).message}`, "network");
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onOuterAbort);
    }

    if (!res.ok) {
      throw new MarketDataError(
        `Hyperliquid returned HTTP ${res.status} for ${symbol} ${interval} candles`,
        "http",
        res.status,
      );
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new MarketDataError("Hyperliquid returned a non-JSON candle response", "validation");
    }
    const parsed = candleSnapshotSchema.safeParse(json);
    if (!parsed.success) {
      throw new MarketDataError(
        `Unexpected candle payload from Hyperliquid: ${parsed.error.issues[0]?.message ?? "invalid"}`,
        "validation",
      );
    }
    const candles: Candle[] = [];
    for (const w of parsed.data) {
      if (w.s !== symbol || w.i !== interval) continue;
      const c = toCandle(w);
      if (isSaneCandle(c)) candles.push(c);
      else this.onInvalid?.("candleSnapshot", `rejected malformed candle @${w.t}`);
    }
    candles.sort((a, b) => a.time - b.time);
    return candles;
  }

  subscribeCandles(symbol: string, interval: Interval, onCandle: (c: Candle) => void) {
    this.assertSymbol(symbol);
    return this.socket.subscribe(`candle:${symbol}:${interval}`, { type: "candle", coin: symbol, interval }, (data) => {
      const p = candleWireSchema.safeParse(data);
      if (!p.success) return this.onInvalid?.("candle", p.error.issues[0]?.message ?? "invalid");
      const c = toCandle(p.data);
      if (!isSaneCandle(c)) return this.onInvalid?.("candle", "OHLC invariant violated");
      onCandle(c);
    });
  }

  subscribeAssetContext(symbol: string, onCtx: (ctx: AssetContext) => void) {
    this.assertSymbol(symbol);
    return this.socket.subscribe(`ctx:${symbol}`, { type: "activeAssetCtx", coin: symbol }, (data, at) => {
      const p = assetCtxWireSchema.safeParse(data);
      if (!p.success) return this.onInvalid?.("activeAssetCtx", p.error.issues[0]?.message ?? "invalid");
      onCtx(toAssetContext(p.data, at));
    });
  }

  subscribeQuote(symbol: string, onQuote: (q: Quote) => void) {
    this.assertSymbol(symbol);
    return this.socket.subscribe(`bbo:${symbol}`, { type: "bbo", coin: symbol }, (data, at) => {
      const p = bboWireSchema.safeParse(data);
      if (!p.success) return this.onInvalid?.("bbo", p.error.issues[0]?.message ?? "invalid");
      for (const l of this.timeListeners) l(p.data.time, at);
      const q = toQuote(p.data, at);
      if (q) onQuote(q);
    });
  }

  onStatus(cb: (e: StreamStatusEvent) => void) {
    return this.socket.onStatus(cb);
  }

  onServerTime(cb: (serverMs: number, localMs: number) => void) {
    this.timeListeners.add(cb);
    return () => {
      this.timeListeners.delete(cb);
    };
  }

  reconnect() {
    this.socket.reconnect();
  }

  dispose() {
    this.socket.dispose();
  }

  private assertSymbol(symbol: string) {
    if (!this.instruments.some((i) => i.symbol === symbol)) {
      throw new MarketDataError(`${symbol} is not supported by the ${this.name} adapter`, "unsupported");
    }
  }
}

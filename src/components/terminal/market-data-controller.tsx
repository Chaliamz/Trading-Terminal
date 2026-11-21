"use client";

import { useEffect } from "react";
import { useComputeStructure } from "@/hooks/use-market";
import { getMarketAdapter, setInvalidMessageListener } from "@/lib/market/provider";
import { ClockSync } from "@/lib/market/clock";
import { mergeCandle, mergeCandles } from "@/lib/market/candles";
import { INTERVAL_MS, MarketDataError, type AssetContext, type Candle, type Quote } from "@/lib/market/types";
import { useMarketStore } from "@/store/market-store";
import { useUiStore } from "@/store/ui-store";

/** Number of historical bars loaded per instrument/timeframe. */
export const HISTORY_BARS = 1500;
const RECONCILE_DELAY_MS = 1500;
const RECONNECT_BACKFILL_BARS = 300;

/**
 * Headless component that owns every market-data subscription.
 * Renders nothing; lives for the lifetime of the terminal.
 */
export function MarketDataController() {
  useStreams();
  useCandleFeed();
  useStructurePublisher();
  return null;
}

/** Computes market structure once and publishes it for every consumer. */
function useStructurePublisher() {
  const structure = useComputeStructure();
  useEffect(() => {
    useMarketStore.getState().setStructure(structure);
  }, [structure]);
}

/** Watchlist / quote / feed-status / clock subscriptions for all instruments. */
function useStreams() {
  useEffect(() => {
    const adapter = getMarketAdapter();
    const store = useMarketStore;
    const clock = new ClockSync();

    // Batch high-frequency updates into one store write per animation frame.
    let pendingQuotes: Record<string, Quote> = {};
    let pendingCtx: Record<string, AssetContext> = {};
    let raf = 0;
    const flush = () => {
      raf = 0;
      const q = pendingQuotes;
      const c = pendingCtx;
      pendingQuotes = {};
      pendingCtx = {};
      let latest = 0;
      for (const v of Object.values(q)) latest = Math.max(latest, v.receivedAt);
      for (const v of Object.values(c)) latest = Math.max(latest, v.receivedAt);
      store.setState((s) => ({
        quotes: Object.keys(q).length ? { ...s.quotes, ...q } : s.quotes,
        contexts: Object.keys(c).length ? { ...s.contexts, ...c } : s.contexts,
        lastMessageAt: latest > 0 ? latest : s.lastMessageAt,
      }));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const unsubs: Array<() => void> = [];
    unsubs.push(
      adapter.onStatus((e) => {
        store.getState().setFeed(e.status, e.detail ?? null, e.connectionId);
      }),
    );
    unsubs.push(adapter.onServerTime((server, local) => clock.add(server, local)));
    for (const inst of adapter.instruments) {
      unsubs.push(
        adapter.subscribeQuote(inst.symbol, (q) => {
          pendingQuotes[q.symbol] = q;
          schedule();
        }),
      );
      unsubs.push(
        adapter.subscribeAssetContext(inst.symbol, (c) => {
          pendingCtx[c.symbol] = c;
          schedule();
        }),
      );
    }
    setInvalidMessageListener((channel, issue) => {
      store.setState((s) => ({ invalidMessages: s.invalidMessages + 1 }));
      if (process.env.NODE_ENV !== "production") console.warn(`[market] invalid ${channel}: ${issue}`);
    });

    const clockTimer = setInterval(() => {
      const off = clock.offset();
      if (off != null) store.getState().setClockOffset(off);
    }, 2000);

    return () => {
      unsubs.forEach((u) => u());
      setInvalidMessageListener(null);
      clearInterval(clockTimer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

/** Historical + live candles for the active instrument / timeframe. */
function useCandleFeed() {
  const symbol = useUiStore((s) => s.activeSymbol);
  const interval = useUiStore((s) => s.interval);
  const reloadNonce = useMarketStore((s) => s.candleReloadNonce);

  useEffect(() => {
    const adapter = getMarketAdapter();
    const store = useMarketStore;
    const key = `${symbol}:${interval}`;
    const intervalMs = INTERVAL_MS[interval];
    const ac = new AbortController();
    let cancelled = false;
    let loaded = false;
    let buffer: Candle[] = [];
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
    let backfillInFlight = false;
    let lastConnectionId: number | null = null;

    store.getState().setCandles(key, []);
    store.getState().setCandleState(key, { status: "loading" });

    const current = () => (store.getState().candleKey === key ? store.getState().candles : null);

    const backfill = async (bars: number, reset: boolean) => {
      if (backfillInFlight || cancelled) return;
      backfillInFlight = true;
      try {
        const recent = await adapter.fetchCandles(symbol, interval, { bars, signal: ac.signal });
        const cur = current();
        if (cancelled || !cur) return;
        store.getState().upsertCandles(key, mergeCandles(cur, recent), reset);
      } catch (err) {
        if (!cancelled && !(err instanceof MarketDataError && err.kind === "aborted")) {
          console.warn("[market] backfill failed", err);
        }
      } finally {
        backfillInFlight = false;
      }
    };

    const applyLive = (c: Candle) => {
      const cur = current();
      if (!cur) return;
      const last = cur[cur.length - 1];
      if (last && c.time > last.time) {
        // A new bar opened: the previous bar is final. Re-fetch the last few bars
        // shortly after to reconcile any trade that landed after our last update.
        if (c.time - last.time > intervalMs) void backfill(Math.ceil((c.time - last.time) / intervalMs) + 3, true);
        if (reconcileTimer) clearTimeout(reconcileTimer);
        reconcileTimer = setTimeout(() => void backfill(3, false), RECONCILE_DELAY_MS);
      }
      const next = mergeCandle(cur, c);
      if (next !== cur) store.getState().upsertCandles(key, next);
    };

    const unsubCandles = adapter.subscribeCandles(symbol, interval, (c) => {
      if (cancelled) return;
      if (!loaded) buffer.push(c);
      else applyLive(c);
    });

    const unsubStatus = adapter.onStatus((e) => {
      if (e.status !== "live") return;
      if (lastConnectionId !== null && e.connectionId !== lastConnectionId && loaded) {
        // Reconnected: fill whatever we missed while disconnected.
        void backfill(RECONNECT_BACKFILL_BARS, true);
      }
      lastConnectionId = e.connectionId;
    });

    (async () => {
      try {
        const hist = await adapter.fetchCandles(symbol, interval, { bars: HISTORY_BARS, signal: ac.signal });
        if (cancelled) return;
        if (hist.length === 0) {
          store.getState().setCandleState(key, {
            status: "error",
            error: `Hyperliquid returned no ${interval} candles for ${symbol}.`,
          });
          return;
        }
        let merged = hist;
        for (const b of buffer) merged = mergeCandle(merged, b);
        buffer = [];
        loaded = true;
        store.getState().upsertCandles(key, merged, true);
        store.getState().setCandleState(key, { status: "ready" });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unknown error loading candles";
        store.getState().setCandleState(key, { status: "error", error: msg });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      unsubCandles();
      unsubStatus();
      if (reconcileTimer) clearTimeout(reconcileTimer);
    };
  }, [symbol, interval, reloadNonce]);
}

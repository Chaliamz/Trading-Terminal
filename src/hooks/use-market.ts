"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { closedCandles } from "@/lib/market/candles";
import { HYPERLIQUID_INSTRUMENTS } from "@/lib/market/hyperliquid/instruments";
import type { Instrument, Quote } from "@/lib/market/types";
import type { PaperQuote } from "@/lib/paper/engine";
import { analyzeStructure, type StructureResult } from "@/lib/structure";
import { useMarketStore } from "@/store/market-store";
import { useUiStore } from "@/store/ui-store";

/** A quote older than this is not used for simulated execution. */
export const QUOTE_MAX_AGE_MS = 10_000;

export function getInstrument(symbol: string): Instrument {
  return HYPERLIQUID_INSTRUMENTS.find((i) => i.symbol === symbol) ?? HYPERLIQUID_INSTRUMENTS[0];
}

export function useActiveInstrument(): Instrument {
  const symbol = useUiStore((s) => s.activeSymbol);
  return getInstrument(symbol);
}

/** Local wall clock that re-renders every `everyMs`. Null until mounted (keeps SSR deterministic). */
export function useNow(everyMs = 1000): number | null {
  const [local, setLocal] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLocal(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [everyMs]);
  return local;
}

/** Local wall clock corrected by the estimated venue clock offset. Null before mount. */
export function useServerNow(everyMs = 1000): number | null {
  const offset = useMarketStore((s) => s.clockOffsetMs);
  const local = useNow(everyMs);
  if (local == null) return null;
  return local + (offset ?? 0);
}

export function isQuoteFresh(q: Quote | undefined, now: number): q is Quote {
  return !!q && now - q.receivedAt <= QUOTE_MAX_AGE_MS;
}

/** Quotes usable for paper execution (fresh only). Stale quotes are omitted so orders are rejected. */
export function freshPaperQuotes(quotes: Record<string, Quote>, now: number): Record<string, PaperQuote | undefined> {
  const out: Record<string, PaperQuote | undefined> = {};
  for (const [k, q] of Object.entries(quotes)) {
    if (isQuoteFresh(q, now)) out[k] = { bid: q.bid, ask: q.ask, time: q.time };
  }
  return out;
}

/** All quotes regardless of age — for marking-to-market display only. */
export function useMarkQuotes(): Record<string, PaperQuote | undefined> {
  const quotes = useMarketStore((s) => s.quotes);
  return useMemo(() => {
    const out: Record<string, PaperQuote | undefined> = {};
    for (const [k, q] of Object.entries(quotes)) out[k] = { bid: q.bid, ask: q.ask, time: q.time };
    return out;
  }, [quotes]);
}

/** Fresh quotes at call time — for event handlers (reads store + clock outside render). */
export function currentFreshQuotes(): Record<string, PaperQuote | undefined> {
  return freshPaperQuotes(useMarketStore.getState().quotes, Date.now());
}

/**
 * Market structure over COMPLETED candles only. Recomputes when a bar closes
 * or the configuration changes — never on intra-bar ticks. Used once, by
 * StructureController, which publishes the result to the market store.
 */
export function useComputeStructure(): StructureResult | null {
  const cfg = useUiStore((s) => s.structure);
  const now = useServerNow(1000);
  const { candles, ready } = useMarketStore(
    useShallow((s) => ({ candles: s.candles, ready: s.candleState.status === "ready" })),
  );

  // Identity of the closed set: count + last closed bar's time and OHLC.
  const closed = useMemo(() => (now == null ? [] : closedCandles(candles, now)), [candles, now]);
  const last = closed[closed.length - 1];
  const first = closed[0];
  const sig = `${closed.length}:${first?.time ?? 0}:${last?.time ?? 0}:${last?.open ?? 0}:${last?.close ?? 0}:${last?.high ?? 0}:${last?.low ?? 0}`;

  return useMemo(
    () => (ready && closed.length > 0 ? analyzeStructure(closed, cfg) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` captures the closed set's identity
    [sig, cfg, ready],
  );
}

/** Latest structure analysis for the active chart. */
export function useStructure(): StructureResult | null {
  return useMarketStore((s) => s.structure);
}

"use client";

import { create } from "zustand";
import type { AssetContext, Candle, FeedStatus, Quote } from "@/lib/market/types";
import type { StructureResult } from "@/lib/structure/types";

export type CandleLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; error: string };

interface MarketState {
  /** `${symbol}:${interval}` the candles belong to. */
  candleKey: string | null;
  candles: Candle[];
  candleState: CandleLoadState;
  /** Bumped when the whole candle array is replaced (vs. a single-bar update). */
  candleResetSeq: number;

  contexts: Record<string, AssetContext>;
  quotes: Record<string, Quote>;

  feedStatus: FeedStatus;
  feedDetail: string | null;
  connectionId: number;
  lastMessageAt: number | null;
  /** Estimated venue clock − local clock (ms). Includes one-way latency, so it is approximate. */
  clockOffsetMs: number | null;
  invalidMessages: number;
  /** Bumped by the user to force a full reload of the active candles. */
  candleReloadNonce: number;
  /** Market-structure analysis of the active candles' closed bars. */
  structure: StructureResult | null;

  setStructure: (s: StructureResult | null) => void;

  reloadCandles: () => void;
  setCandles: (key: string, candles: Candle[]) => void;
  upsertCandles: (key: string, candles: Candle[], replaceSeq?: boolean) => void;
  setCandleState: (key: string, s: CandleLoadState) => void;
  setContext: (ctx: AssetContext) => void;
  setQuote: (q: Quote) => void;
  setFeed: (status: FeedStatus, detail: string | null, connectionId: number) => void;
  markMessage: (at: number) => void;
  setClockOffset: (ms: number) => void;
}

export const useMarketStore = create<MarketState>()((set) => ({
  candleKey: null,
  candles: [],
  candleState: { status: "idle" },
  candleResetSeq: 0,
  contexts: {},
  quotes: {},
  feedStatus: "idle",
  feedDetail: null,
  connectionId: 0,
  lastMessageAt: null,
  clockOffsetMs: null,
  invalidMessages: 0,
  candleReloadNonce: 0,
  structure: null,

  setStructure: (structure) => set({ structure }),

  reloadCandles: () => set((s) => ({ candleReloadNonce: s.candleReloadNonce + 1 })),
  setCandles: (key, candles) =>
    set((s) => ({
      candleKey: key,
      candles,
      candleResetSeq: s.candleResetSeq + 1,
      structure: s.candleKey === key ? s.structure : null,
    })),
  upsertCandles: (key, candles, replaceSeq = false) =>
    set((s) => (s.candleKey !== key ? s : { candles, candleResetSeq: replaceSeq ? s.candleResetSeq + 1 : s.candleResetSeq })),
  setCandleState: (key, candleState) =>
    set((s) => (s.candleKey !== null && s.candleKey !== key ? s : { candleKey: key, candleState })),
  setContext: (ctx) => set((s) => ({ contexts: { ...s.contexts, [ctx.symbol]: ctx } })),
  setQuote: (q) => set((s) => ({ quotes: { ...s.quotes, [q.symbol]: q } })),
  setFeed: (feedStatus, feedDetail, connectionId) => set({ feedStatus, feedDetail, connectionId }),
  markMessage: (lastMessageAt) => set({ lastMessageAt }),
  setClockOffset: (clockOffsetMs) => set({ clockOffsetMs }),
}));

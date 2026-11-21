import { z } from "zod";
import type { AssetContext, Candle, Quote } from "../types";

/**
 * Wire schemas for Hyperliquid's public info API and WebSocket.
 * Shapes verified against live responses on 2026-11-21:
 *   candle: {"t","T","s","i","o","c","h","l","v","n"}  (prices/volume are decimal strings)
 *   bbo:    {"coin","time","bbo":[{px,sz,n}|null, {px,sz,n}|null]}
 *   activeAssetCtx: {"coin","ctx":{funding,openInterest,prevDayPx,dayNtlVlm,oraclePx,markPx,midPx,...}}
 */

const decimal = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected decimal string")
  .transform(Number);

export const candleWireSchema = z.object({
  t: z.number().int(),
  T: z.number().int(),
  s: z.string(),
  i: z.string(),
  o: decimal,
  c: decimal,
  h: decimal,
  l: decimal,
  v: decimal,
  n: z.number().int(),
});

export const candleSnapshotSchema = z.array(candleWireSchema);

const level = z.object({ px: decimal, sz: decimal, n: z.number().int() });

export const bboWireSchema = z.object({
  coin: z.string(),
  time: z.number().int(),
  bbo: z.tuple([level.nullable(), level.nullable()]),
});

export const assetCtxWireSchema = z.object({
  coin: z.string(),
  ctx: z.object({
    funding: decimal,
    openInterest: decimal,
    prevDayPx: decimal,
    dayNtlVlm: decimal,
    oraclePx: decimal,
    markPx: decimal,
    midPx: decimal.nullable().optional(),
  }),
});

export const wsEnvelopeSchema = z.object({
  channel: z.string(),
  data: z.unknown().optional(),
});

export type CandleWire = z.infer<typeof candleWireSchema>;

export function toCandle(w: CandleWire): Candle {
  return { time: w.t, closeTime: w.T, open: w.o, high: w.h, low: w.l, close: w.c, volume: w.v, trades: w.n };
}

/** Validates OHLC invariants that a schema cannot express. */
export function isSaneCandle(c: Candle): boolean {
  return (
    c.open > 0 &&
    c.close > 0 &&
    c.low > 0 &&
    c.high >= c.low &&
    c.high >= Math.max(c.open, c.close) &&
    c.low <= Math.min(c.open, c.close) &&
    c.volume >= 0 &&
    c.closeTime > c.time
  );
}

export function toQuote(w: z.infer<typeof bboWireSchema>, receivedAt: number): Quote | null {
  const [bid, ask] = w.bbo;
  if (!bid || !ask || !(bid.px > 0) || !(ask.px > 0) || ask.px < bid.px) return null;
  return { symbol: w.coin, bid: bid.px, bidSize: bid.sz, ask: ask.px, askSize: ask.sz, time: w.time, receivedAt };
}

export function toAssetContext(w: z.infer<typeof assetCtxWireSchema>, receivedAt: number): AssetContext {
  return {
    symbol: w.coin,
    markPx: w.ctx.markPx,
    midPx: w.ctx.midPx ?? null,
    oraclePx: w.ctx.oraclePx,
    prevDayPx: w.ctx.prevDayPx,
    dayNotionalVolume: w.ctx.dayNtlVlm,
    funding: w.ctx.funding,
    openInterest: w.ctx.openInterest,
    receivedAt,
  };
}

import type { Candle } from "./types";

/**
 * Merges one streamed candle into a time-sorted array without mutating it.
 *  - same open time as the last bar → replace (forming bar update)
 *  - newer than the last bar        → append
 *  - older                          → replace the matching bar if present, otherwise insert in order
 * Returns the same array reference when nothing changed.
 */
export function mergeCandle(candles: readonly Candle[], c: Candle): Candle[] {
  const n = candles.length;
  if (n === 0) return [c];
  const last = candles[n - 1];
  if (c.time === last.time) {
    if (sameCandle(last, c)) return candles as Candle[];
    const out = candles.slice();
    out[n - 1] = c;
    return out;
  }
  if (c.time > last.time) return [...candles, c];
  const idx = lowerBound(candles, c.time);
  const out = candles.slice();
  if (idx < n && candles[idx].time === c.time) {
    if (sameCandle(candles[idx], c)) return candles as Candle[];
    out[idx] = c;
  } else {
    out.splice(idx, 0, c);
  }
  return out;
}

/** Merges a batch (e.g. a REST backfill). Incoming bars win on equal open time. */
export function mergeCandles(candles: readonly Candle[], incoming: readonly Candle[]): Candle[] {
  if (incoming.length === 0) return candles as Candle[];
  const map = new Map<number, Candle>();
  for (const c of candles) map.set(c.time, c);
  for (const c of incoming) map.set(c.time, c);
  return [...map.values()].sort((a, b) => a.time - b.time);
}

/**
 * Candles whose period has ended according to the (offset-corrected) clock.
 * The forming bar is excluded so analytics never see partial data.
 */
export function closedCandles(candles: readonly Candle[], nowMs: number): Candle[] {
  let end = candles.length;
  while (end > 0 && candles[end - 1].closeTime >= nowMs) end--;
  return end === candles.length ? (candles as Candle[]) : candles.slice(0, end);
}

function sameCandle(a: Candle, b: Candle) {
  return (
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume &&
    a.closeTime === b.closeTime
  );
}

function lowerBound(candles: readonly Candle[], time: number) {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (candles[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

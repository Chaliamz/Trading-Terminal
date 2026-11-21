import type { OHLC, PivotConfig, Swing } from "./types";

/**
 * Fractal swing detection.
 *
 * A swing high at index i requires:
 *   high[i] >  high[j] for every j in [i-left, i-1]   (strict on the left)
 *   high[i] >= high[j] for every j in [i+1, i+right]  (non-strict on the right)
 * Swing lows mirror this. The strict/non-strict split makes equal highs resolve
 * deterministically to the FIRST bar of the run.
 *
 * Look-ahead: a pivot at i is only knowable once candle i+right has closed, so
 * `confirmedIndex = i + right`. Callers must only feed completed candles.
 */
export function detectSwings(candles: readonly OHLC[], cfg: PivotConfig): Swing[] {
  const left = Math.max(1, Math.floor(cfg.left));
  const right = Math.max(1, Math.floor(cfg.right));
  const out: Swing[] = [];
  let lastHigh: number | null = null;
  let lastLow: number | null = null;

  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j < i && (isHigh || isLow); j++) {
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    for (let j = i + 1; j <= i + right && (isHigh || isLow); j++) {
      if (candles[j].high > c.high) isHigh = false;
      if (candles[j].low < c.low) isLow = false;
    }
    // Emit in a fixed order (high before low) when an outside bar is both.
    if (isHigh) {
      out.push({
        kind: "high",
        index: i,
        time: c.time,
        price: c.high,
        confirmedIndex: i + right,
        label: lastHigh == null ? null : c.high > lastHigh ? "HH" : "LH",
      });
      lastHigh = c.high;
    }
    if (isLow) {
      out.push({
        kind: "low",
        index: i,
        time: c.time,
        price: c.low,
        confirmedIndex: i + right,
        label: lastLow == null ? null : c.low < lastLow ? "LL" : "HL",
      });
      lastLow = c.low;
    }
  }
  return out;
}

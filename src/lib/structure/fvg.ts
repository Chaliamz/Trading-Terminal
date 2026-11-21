import type { FairValueGap, OHLC } from "./types";

/**
 * Three-candle fair value gaps.
 *   Bullish at i: low[i]  > high[i-2]  → gap = [high[i-2], low[i]]
 *   Bearish at i: high[i] < low[i-2]   → gap = [high[i], low[i-2]]
 * The gap exists once candle i has closed. Mitigation is evaluated only on
 * candles strictly after i:
 *   Bullish: price trading down into the gap (low < top) fills it partially;
 *            low <= bottom fills it completely.
 *   Bearish mirrors this.
 * `minGapPct` filters noise gaps smaller than a fraction of the reference price.
 */
export function detectFVGs(candles: readonly OHLC[], minGapPct: number): FairValueGap[] {
  const out: FairValueGap[] = [];
  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2];
    const c = candles[i];
    const ref = candles[i - 1].close;
    if (c.low > a.high) {
      const gap: FairValueGap = {
        direction: "bullish",
        bottom: a.high,
        top: c.low,
        startIndex: i - 2,
        startTime: a.time,
        createdIndex: i,
        createdTime: c.time,
        status: "open",
        fillPct: 0,
        filledIndex: null,
        filledTime: null,
      };
      if ((gap.top - gap.bottom) / ref >= minGapPct) out.push(gap);
    } else if (c.high < a.low) {
      const gap: FairValueGap = {
        direction: "bearish",
        bottom: c.high,
        top: a.low,
        startIndex: i - 2,
        startTime: a.time,
        createdIndex: i,
        createdTime: c.time,
        status: "open",
        fillPct: 0,
        filledIndex: null,
        filledTime: null,
      };
      if ((gap.top - gap.bottom) / ref >= minGapPct) out.push(gap);
    }
  }

  for (const gap of out) {
    const height = gap.top - gap.bottom;
    for (let k = gap.createdIndex + 1; k < candles.length; k++) {
      const bar = candles[k];
      const penetration = gap.direction === "bullish" ? gap.top - bar.low : bar.high - gap.bottom;
      if (penetration <= 0) continue;
      const pct = Math.min(1, penetration / height);
      if (pct > gap.fillPct) gap.fillPct = pct;
      if (pct >= 1) {
        gap.status = "filled";
        gap.filledIndex = k;
        gap.filledTime = bar.time;
        break;
      }
      gap.status = "partial";
    }
  }
  return out;
}

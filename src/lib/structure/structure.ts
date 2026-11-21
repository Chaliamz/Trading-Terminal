import { detectFVGs } from "./fvg";
import { detectSwings } from "./pivots";
import type {
  Direction,
  LiquiditySweep,
  OHLC,
  StructureBreak,
  StructureConfig,
  StructureResult,
  Swing,
} from "./types";

interface Level {
  swing: Swing;
}

/**
 * Bar-by-bar market-structure state machine over COMPLETED candles.
 *
 * At bar k only swings with confirmedIndex < k are visible (the confirming
 * candle k = confirmedIndex cannot itself break the pivot by construction, and
 * excluding it keeps the rule simple and strictly causal).
 *
 * Break of structure:
 *   The reference levels are the most recent confirmed, not-yet-broken swing
 *   high and swing low. A bullish break occurs when close[k] > refHigh
 *   (or high[k] > refHigh with breakOn = "wick"). Bearish mirrors this.
 *   - Break in the direction of the current trend (or with no trend yet) → BOS
 *   - Break against the current trend → CHoCH (trend flips)
 *   A broken level is consumed and cannot break again.
 *
 * Liquidity sweep:
 *   Every confirmed swing that has not been closed through is a liquidity pool
 *   (capped at maxLiquidityLevels per side, newest kept). A sweep is a candle
 *   whose wick trades beyond the pool but closes back on the original side.
 *   Each pool can be swept once; a close beyond it removes it without a sweep.
 *   Sweeps are always evaluated on close, independent of breakOn.
 */
export function analyzeStructure(candles: readonly OHLC[], cfg: StructureConfig): StructureResult {
  const swings = detectSwings(candles, cfg);
  const fvgs = detectFVGs(candles, cfg.fvgMinGapPct);

  const breaks: StructureBreak[] = [];
  const sweeps: LiquiditySweep[] = [];
  let trend: Direction | null = null;

  let refHigh: Swing | null = null;
  let refLow: Swing | null = null;
  const highPools: Level[] = [];
  const lowPools: Level[] = [];

  // swings are sorted by index, and confirmedIndex = index + right is monotone too.
  let nextSwing = 0;
  const maxPools = Math.max(1, cfg.maxLiquidityLevels);

  for (let k = 0; k < candles.length; k++) {
    while (nextSwing < swings.length && swings[nextSwing].confirmedIndex < k) {
      const s = swings[nextSwing++];
      if (s.kind === "high") {
        refHigh = s;
        highPools.push({ swing: s });
        if (highPools.length > maxPools) highPools.shift();
      } else {
        refLow = s;
        lowPools.push({ swing: s });
        if (lowPools.length > maxPools) lowPools.shift();
      }
    }

    const bar = candles[k];

    // --- Liquidity sweeps (wick beyond, close back inside) ---
    for (let p = highPools.length - 1; p >= 0; p--) {
      const lvl = highPools[p].swing.price;
      if (bar.close > lvl) {
        highPools.splice(p, 1);
      } else if (bar.high > lvl) {
        sweeps.push({
          direction: "bearish",
          level: lvl,
          swingIndex: highPools[p].swing.index,
          swingTime: highPools[p].swing.time,
          index: k,
          time: bar.time,
          extreme: bar.high,
        });
        highPools.splice(p, 1);
      }
    }
    for (let p = lowPools.length - 1; p >= 0; p--) {
      const lvl = lowPools[p].swing.price;
      if (bar.close < lvl) {
        lowPools.splice(p, 1);
      } else if (bar.low < lvl) {
        sweeps.push({
          direction: "bullish",
          level: lvl,
          swingIndex: lowPools[p].swing.index,
          swingTime: lowPools[p].swing.time,
          index: k,
          time: bar.time,
          extreme: bar.low,
        });
        lowPools.splice(p, 1);
      }
    }

    // --- Breaks of structure ---
    const upProbe = cfg.breakOn === "wick" ? bar.high : bar.close;
    const downProbe = cfg.breakOn === "wick" ? bar.low : bar.close;

    if (refHigh && upProbe > refHigh.price) {
      breaks.push({
        kind: trend === "bearish" ? "CHoCH" : "BOS",
        direction: "bullish",
        level: refHigh.price,
        swingIndex: refHigh.index,
        swingTime: refHigh.time,
        breakIndex: k,
        breakTime: bar.time,
      });
      trend = "bullish";
      refHigh = null;
    }
    if (refLow && downProbe < refLow.price) {
      breaks.push({
        kind: trend === "bullish" ? "CHoCH" : "BOS",
        direction: "bearish",
        level: refLow.price,
        swingIndex: refLow.index,
        swingTime: refLow.time,
        breakIndex: k,
        breakTime: bar.time,
      });
      trend = "bearish";
      refLow = null;
    }
  }

  return { swings, breaks, sweeps, fvgs, trend, barCount: candles.length };
}

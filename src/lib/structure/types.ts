/** Minimal candle shape the structure algorithms need (keeps them venue- and UI-agnostic). */
export interface OHLC {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Direction = "bullish" | "bearish";

export interface PivotConfig {
  /** Bars to the left that must be strictly lower (for highs) / higher (for lows). */
  left: number;
  /** Bars to the right that must be lower-or-equal / higher-or-equal. A pivot is only known after these close. */
  right: number;
}

export interface StructureConfig extends PivotConfig {
  /** "close": a candle body close beyond the level confirms the break. "wick": any trade beyond it does. */
  breakOn: "close" | "wick";
  /** Minimum FVG height as a fraction of the reference price (e.g. 0.0005 = 0.05%). */
  fvgMinGapPct: number;
  /** Maximum number of unbroken swing levels kept as liquidity pools per side. */
  maxLiquidityLevels: number;
}

export const DEFAULT_STRUCTURE_CONFIG: StructureConfig = {
  left: 3,
  right: 3,
  breakOn: "close",
  fvgMinGapPct: 0.0005,
  maxLiquidityLevels: 8,
};

export interface Swing {
  kind: "high" | "low";
  index: number;
  time: number;
  price: number;
  /** Index of the candle whose close confirms the pivot (index + right). */
  confirmedIndex: number;
  /** HH / LH for highs, HL / LL for lows, null for the first swing of its kind. */
  label: "HH" | "LH" | "HL" | "LL" | null;
}

export interface StructureBreak {
  kind: "BOS" | "CHoCH";
  direction: Direction;
  level: number;
  swingIndex: number;
  swingTime: number;
  breakIndex: number;
  breakTime: number;
}

export interface LiquiditySweep {
  /** "bearish" = buy-side liquidity above a swing high was taken and rejected. */
  direction: Direction;
  level: number;
  swingIndex: number;
  swingTime: number;
  index: number;
  time: number;
  /** Extreme of the sweeping wick. */
  extreme: number;
}

export interface FairValueGap {
  direction: Direction;
  top: number;
  bottom: number;
  /** Index of the first candle of the 3-candle pattern (visual anchor). */
  startIndex: number;
  startTime: number;
  /** Index of the third candle: the gap is only known once this candle closes. */
  createdIndex: number;
  createdTime: number;
  status: "open" | "partial" | "filled";
  /** Fraction of the gap that has been traded into (0..1). */
  fillPct: number;
  filledIndex: number | null;
  filledTime: number | null;
}

export interface StructureResult {
  swings: Swing[];
  breaks: StructureBreak[];
  sweeps: LiquiditySweep[];
  fvgs: FairValueGap[];
  /** Trend after processing every candle. */
  trend: Direction | null;
  /** Number of (closed) candles analysed. */
  barCount: number;
}

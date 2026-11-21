/**
 * Exchange-neutral market-data types. Nothing in this file may reference a
 * specific venue: adapters translate their wire formats into these shapes.
 */

export const INTERVALS = ["5m", "15m", "1h", "4h", "1d"] as const;
export type Interval = (typeof INTERVALS)[number];

export const INTERVAL_MS: Record<Interval, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

export const INTERVAL_LABEL: Record<Interval, string> = {
  "5m": "5M",
  "15m": "15M",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
};

export interface Instrument {
  /** Venue symbol used on the wire (e.g. "BTC"). */
  symbol: string;
  /** Human label (e.g. "BTC-PERP"). */
  display: string;
  base: string;
  quote: string;
  /** Decimals used to display prices. */
  pxDecimals: number;
  /** Lot size precision: order sizes are floored to this many decimals. */
  szDecimals: number;
  /** Venue-imposed leverage ceiling (informational). */
  maxLeverage: number;
}

/** OHLCV candle. Times are epoch milliseconds (open time inclusive, close time inclusive). */
export interface Candle {
  time: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

/** Per-asset market context (24h stats, mark, funding, OI). */
export interface AssetContext {
  symbol: string;
  markPx: number;
  midPx: number | null;
  oraclePx: number;
  prevDayPx: number;
  dayNotionalVolume: number;
  /** Funding rate per funding interval (Hyperliquid: hourly). */
  funding: number;
  openInterest: number;
  receivedAt: number;
}

/** Best bid / offer. Prices used for simulated market fills. */
export interface Quote {
  symbol: string;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  /** Venue event time (ms). */
  time: number;
  receivedAt: number;
}

export type FeedStatus = "idle" | "connecting" | "live" | "reconnecting" | "stale" | "error";

export type Unsubscribe = () => void;

export interface StreamStatusEvent {
  status: FeedStatus;
  detail?: string;
  /** Incremented every time a connection is (re)established. */
  connectionId: number;
}

export interface MarketDataAdapter {
  readonly id: string;
  readonly name: string;
  readonly instruments: readonly Instrument[];

  /** Fetch the most recent `bars` candles (including the currently forming candle). */
  fetchCandles(
    symbol: string,
    interval: Interval,
    opts: { bars: number; signal?: AbortSignal; endTime?: number },
  ): Promise<Candle[]>;

  subscribeCandles(symbol: string, interval: Interval, onCandle: (c: Candle) => void): Unsubscribe;
  subscribeAssetContext(symbol: string, onCtx: (ctx: AssetContext) => void): Unsubscribe;
  subscribeQuote(symbol: string, onQuote: (q: Quote) => void): Unsubscribe;

  onStatus(cb: (e: StreamStatusEvent) => void): Unsubscribe;
  /** Server-time samples (venue time, local receive time) for clock-offset estimation. */
  onServerTime(cb: (serverMs: number, localMs: number) => void): Unsubscribe;
  /** Force an immediate reconnect (user-initiated). */
  reconnect(): void;
}

export class MarketDataError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "http" | "validation" | "aborted" | "timeout" | "unsupported",
    readonly status?: number,
  ) {
    super(message);
    this.name = "MarketDataError";
  }
}

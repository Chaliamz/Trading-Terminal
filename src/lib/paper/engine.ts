/**
 * Paper-trading engine. Pure functions over an immutable account value.
 *
 * Execution model (SIMULATED — no exchange orders are ever sent):
 *  - Market orders fill against the live top of book: longs pay the ask,
 *    shorts receive the bid. No depth / partial fills are modelled.
 *  - Stop-loss / take-profit trigger on the price you would exit at
 *    (bid for longs, ask for shorts) and fill at THAT observed price, not at
 *    the trigger level. Gaps through a stop therefore realise slippage.
 *  - Taker fee is charged on entry and exit notional.
 *  - Positions are not netted: each order creates its own position so every
 *    trade has a clean journal entry with its own entry, stop and R-multiple.
 *  - No funding, no liquidation engine. Gross exposure is capped by
 *    `leverageCap` × equity at order time.
 */
import type { Side } from "@/lib/risk/position-size";

export type { Side };

export interface PaperQuote {
  bid: number;
  ask: number;
  time: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: Side;
  size: number;
  entryPrice: number;
  openedAt: number;
  stopLoss: number | null;
  takeProfit: number | null;
  entryFee: number;
  /** |entry - stop| × size at open, used for R-multiples. Null when opened without a stop. */
  initialRisk: number | null;
}

export type CloseReason = "manual" | "stop-loss" | "take-profit";

export interface ClosedTrade {
  id: string;
  symbol: string;
  side: Side;
  size: number;
  entryPrice: number;
  exitPrice: number;
  openedAt: number;
  closedAt: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  rMultiple: number | null;
  reason: CloseReason;
  stopLoss: number | null;
  takeProfit: number | null;
  note: string;
}

export interface PaperAccount {
  startingBalance: number;
  /** Realised cash balance (starting balance + realised PnL − fees). */
  balance: number;
  feeRate: number;
  leverageCap: number;
  positions: Position[];
  trades: ClosedTrade[];
  createdAt: number;
}

export const DEFAULT_STARTING_BALANCE = 10_000;
/** Assumed taker fee (Hyperliquid base perps tier). User-configurable; verify against your own tier. */
export const DEFAULT_FEE_RATE = 0.00045;
export const DEFAULT_LEVERAGE_CAP = 10;

export function createAccount(now: number, startingBalance = DEFAULT_STARTING_BALANCE): PaperAccount {
  return {
    startingBalance,
    balance: startingBalance,
    feeRate: DEFAULT_FEE_RATE,
    leverageCap: DEFAULT_LEVERAGE_CAP,
    positions: [],
    trades: [],
    createdAt: now,
  };
}

const sign = (side: Side) => (side === "long" ? 1 : -1);

export function entryPriceFor(side: Side, q: PaperQuote) {
  return side === "long" ? q.ask : q.bid;
}

export function exitPriceFor(side: Side, q: PaperQuote) {
  return side === "long" ? q.bid : q.ask;
}

export function unrealizedPnl(p: Position, q: PaperQuote | undefined): number | null {
  if (!q) return null;
  return (exitPriceFor(p.side, q) - p.entryPrice) * p.size * sign(p.side);
}

export interface AccountMetrics {
  balance: number;
  unrealized: number;
  equity: number;
  /** True when at least one open position has no quote, so equity is incomplete. */
  equityIncomplete: boolean;
  grossExposure: number;
  realizedPnl: number;
  totalFees: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgR: number | null;
}

export function accountMetrics(a: PaperAccount, quotes: Record<string, PaperQuote | undefined>): AccountMetrics {
  let unrealized = 0;
  let exposure = 0;
  let incomplete = false;
  for (const p of a.positions) {
    const q = quotes[p.symbol];
    const u = unrealizedPnl(p, q);
    if (u == null) {
      incomplete = true;
      exposure += p.size * p.entryPrice;
    } else {
      unrealized += u;
      exposure += p.size * exitPriceFor(p.side, q!);
    }
  }
  let wins = 0;
  let losses = 0;
  let realized = 0;
  let fees = 0;
  let rSum = 0;
  let rCount = 0;
  for (const t of a.trades) {
    realized += t.netPnl;
    fees += t.fees;
    if (t.netPnl > 0) wins++;
    else if (t.netPnl < 0) losses++;
    if (t.rMultiple != null) {
      rSum += t.rMultiple;
      rCount++;
    }
  }
  for (const p of a.positions) fees += p.entryFee;
  const decided = wins + losses;
  return {
    balance: a.balance,
    unrealized,
    equity: a.balance + unrealized,
    equityIncomplete: incomplete,
    grossExposure: exposure,
    realizedPnl: realized,
    totalFees: fees,
    wins,
    losses,
    winRate: decided > 0 ? wins / decided : null,
    avgR: rCount > 0 ? rSum / rCount : null,
  };
}

export interface OpenOrder {
  id: string;
  symbol: string;
  side: Side;
  size: number;
  stopLoss: number | null;
  takeProfit: number | null;
}

export type EngineResult = { ok: true; account: PaperAccount; message: string } | { ok: false; error: string };

export function validateProtection(
  side: Side,
  ref: number,
  stopLoss: number | null,
  takeProfit: number | null,
): string | null {
  if (stopLoss != null) {
    if (!(stopLoss > 0)) return "Stop-loss must be greater than 0.";
    if (side === "long" && stopLoss >= ref) return "Long stop-loss must be below the current bid.";
    if (side === "short" && stopLoss <= ref) return "Short stop-loss must be above the current ask.";
  }
  if (takeProfit != null) {
    if (!(takeProfit > 0)) return "Take-profit must be greater than 0.";
    if (side === "long" && takeProfit <= ref) return "Long take-profit must be above the current bid.";
    if (side === "short" && takeProfit >= ref) return "Short take-profit must be below the current ask.";
  }
  return null;
}

export function openPosition(
  a: PaperAccount,
  order: OpenOrder,
  quote: PaperQuote | undefined,
  quotes: Record<string, PaperQuote | undefined>,
  now: number,
): EngineResult {
  if (!quote) return { ok: false, error: `No live quote for ${order.symbol}; order rejected.` };
  if (!(quote.bid > 0) || !(quote.ask > 0) || quote.ask < quote.bid)
    return { ok: false, error: "Invalid top of book; order rejected." };
  if (!Number.isFinite(order.size) || order.size <= 0) return { ok: false, error: "Size must be greater than 0." };

  const fill = entryPriceFor(order.side, quote);
  // Protection is validated against the price the position would exit at right now.
  const exitRef = exitPriceFor(order.side, quote);
  const protErr = validateProtection(order.side, exitRef, order.stopLoss, order.takeProfit);
  if (protErr) return { ok: false, error: protErr };

  const notional = fill * order.size;
  const fee = notional * a.feeRate;
  const m = accountMetrics(a, quotes);
  if (m.equity - fee <= 0) return { ok: false, error: "Insufficient equity." };
  const maxExposure = (m.equity - fee) * a.leverageCap;
  if (m.grossExposure + notional > maxExposure + 1e-9) {
    return {
      ok: false,
      error: `Exceeds simulated leverage cap (${a.leverageCap}×): max additional notional ≈ $${Math.max(0, maxExposure - m.grossExposure).toFixed(2)}.`,
    };
  }

  const position: Position = {
    id: order.id,
    symbol: order.symbol,
    side: order.side,
    size: order.size,
    entryPrice: fill,
    openedAt: now,
    stopLoss: order.stopLoss,
    takeProfit: order.takeProfit,
    entryFee: fee,
    initialRisk: order.stopLoss != null ? Math.abs(fill - order.stopLoss) * order.size : null,
  };
  return {
    ok: true,
    account: { ...a, balance: a.balance - fee, positions: [...a.positions, position] },
    message: `${order.side === "long" ? "Bought" : "Sold"} ${order.size} ${order.symbol} @ ${fill}`,
  };
}

export function closePosition(
  a: PaperAccount,
  positionId: string,
  quote: PaperQuote | undefined,
  reason: CloseReason,
  now: number,
): EngineResult {
  const p = a.positions.find((x) => x.id === positionId);
  if (!p) return { ok: false, error: "Position not found." };
  if (!quote) return { ok: false, error: `No live quote for ${p.symbol}; cannot close.` };
  const exit = exitPriceFor(p.side, quote);
  const gross = (exit - p.entryPrice) * p.size * sign(p.side);
  const exitFee = exit * p.size * a.feeRate;
  const net = gross - p.entryFee - exitFee;
  const trade: ClosedTrade = {
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    size: p.size,
    entryPrice: p.entryPrice,
    exitPrice: exit,
    openedAt: p.openedAt,
    closedAt: now,
    grossPnl: gross,
    fees: p.entryFee + exitFee,
    netPnl: net,
    rMultiple: p.initialRisk && p.initialRisk > 0 ? net / p.initialRisk : null,
    reason,
    stopLoss: p.stopLoss,
    takeProfit: p.takeProfit,
    note: "",
  };
  return {
    ok: true,
    account: {
      ...a,
      balance: a.balance + gross - exitFee,
      positions: a.positions.filter((x) => x.id !== positionId),
      trades: [trade, ...a.trades],
    },
    message: `Closed ${p.side} ${p.size} ${p.symbol} @ ${exit} (${reason})`,
  };
}

export function updateProtection(
  a: PaperAccount,
  positionId: string,
  stopLoss: number | null,
  takeProfit: number | null,
  quote: PaperQuote | undefined,
): EngineResult {
  const p = a.positions.find((x) => x.id === positionId);
  if (!p) return { ok: false, error: "Position not found." };
  if (quote) {
    const err = validateProtection(p.side, exitPriceFor(p.side, quote), stopLoss, takeProfit);
    if (err) return { ok: false, error: err };
  }
  return {
    ok: true,
    account: {
      ...a,
      positions: a.positions.map((x) => (x.id === positionId ? { ...x, stopLoss, takeProfit } : x)),
    },
    message: "Protection updated",
  };
}

export interface TriggerHit {
  positionId: string;
  reason: Exclude<CloseReason, "manual">;
}

/** Returns SL/TP hits for positions on `symbol` given its latest quote. Stop-loss wins ties. */
export function findTriggers(a: PaperAccount, symbol: string, q: PaperQuote): TriggerHit[] {
  const hits: TriggerHit[] = [];
  for (const p of a.positions) {
    if (p.symbol !== symbol) continue;
    const px = exitPriceFor(p.side, q);
    if (p.side === "long") {
      if (p.stopLoss != null && px <= p.stopLoss) hits.push({ positionId: p.id, reason: "stop-loss" });
      else if (p.takeProfit != null && px >= p.takeProfit) hits.push({ positionId: p.id, reason: "take-profit" });
    } else {
      if (p.stopLoss != null && px >= p.stopLoss) hits.push({ positionId: p.id, reason: "stop-loss" });
      else if (p.takeProfit != null && px <= p.takeProfit) hits.push({ positionId: p.id, reason: "take-profit" });
    }
  }
  return hits;
}

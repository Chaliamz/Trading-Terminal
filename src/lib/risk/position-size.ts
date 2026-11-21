import { floorTo } from "@/lib/utils";

export type Side = "long" | "short";

export interface PositionSizeInput {
  equity: number;
  /** Percent of equity to risk, e.g. 1 for 1%. */
  riskPct: number;
  entry: number;
  stop: number;
  /** Target reward multiple used to derive the take-profit (e.g. 2 for 2R). */
  rewardMultiple: number;
  /** Taker fee rate per side as a fraction (0.00045 = 0.045%). */
  feeRate: number;
  /** When true, round-trip fees are budgeted inside the risk amount. */
  includeFees: boolean;
  /** Lot precision: size is floored to this many decimals so realised risk never exceeds budget. */
  szDecimals: number;
  /** Optional explicit side; if given it must agree with the stop placement. */
  side?: Side;
}

export interface PositionSizeResult {
  ok: true;
  side: Side;
  riskBudget: number;
  stopDistance: number;
  stopPct: number;
  size: number;
  notional: number;
  /** Loss if the stop fills exactly at the stop price, including fees when enabled. */
  riskAtStop: number;
  takeProfit: number;
  /** Gross reward / gross risk (price distances). */
  rr: number;
  /** Reward / risk after round-trip fees. */
  netRr: number;
  /** Notional / equity. */
  leverage: number;
  estimatedFees: number;
  warnings: string[];
}

export interface PositionSizeError {
  ok: false;
  error: string;
}

const isPos = (n: number) => Number.isFinite(n) && n > 0;

export function calcPositionSize(input: PositionSizeInput): PositionSizeResult | PositionSizeError {
  const { equity, riskPct, entry, stop, rewardMultiple, feeRate, includeFees, szDecimals } = input;

  if (!isPos(equity)) return { ok: false, error: "Account equity must be greater than 0." };
  if (!isPos(riskPct) || riskPct > 100) return { ok: false, error: "Risk must be between 0 and 100%." };
  if (!isPos(entry)) return { ok: false, error: "Entry price must be greater than 0." };
  if (!isPos(stop)) return { ok: false, error: "Stop-loss must be greater than 0." };
  if (!isPos(rewardMultiple)) return { ok: false, error: "Reward multiple must be greater than 0." };
  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 0.05)
    return { ok: false, error: "Fee rate must be between 0% and 5%." };
  if (entry === stop) return { ok: false, error: "Stop-loss cannot equal entry." };

  const side: Side = stop < entry ? "long" : "short";
  if (input.side && input.side !== side) {
    return {
      ok: false,
      error:
        input.side === "long"
          ? "Long stop-loss must be below entry."
          : "Short stop-loss must be above entry.",
    };
  }

  const stopDistance = Math.abs(entry - stop);
  const riskBudget = (equity * riskPct) / 100;
  const feePerUnit = includeFees ? feeRate * (entry + stop) : 0;
  const lossPerUnit = stopDistance + feePerUnit;
  const rawSize = riskBudget / lossPerUnit;
  const size = floorTo(rawSize, Math.max(0, Math.floor(szDecimals)));

  if (size <= 0) {
    return {
      ok: false,
      error: `Position below minimum lot (${(10 ** -szDecimals).toFixed(szDecimals)}). Widen risk or tighten stop.`,
    };
  }

  const takeProfit = side === "long" ? entry + rewardMultiple * stopDistance : entry - rewardMultiple * stopDistance;
  const notional = size * entry;
  const riskAtStop = size * lossPerUnit;
  const estimatedFees = size * feeRate * (entry + takeProfit);
  const grossReward = size * Math.abs(takeProfit - entry);
  const grossRiskWithFees = size * (stopDistance + feeRate * (entry + stop));
  const netRr = (grossReward - estimatedFees) / grossRiskWithFees;

  const warnings: string[] = [];
  const leverage = notional / equity;
  if (leverage > 1) warnings.push(`Notional is ${leverage.toFixed(2)}× equity — requires leverage.`);
  if (takeProfit <= 0) warnings.push("Derived take-profit is at or below zero; reduce the reward multiple.");
  if (stopDistance / entry < 0.001) warnings.push("Stop is within 0.1% of entry — vulnerable to spread and noise.");

  return {
    ok: true,
    side,
    riskBudget,
    stopDistance,
    stopPct: stopDistance / entry,
    size,
    notional,
    riskAtStop,
    takeProfit,
    rr: rewardMultiple,
    netRr,
    leverage,
    estimatedFees,
    warnings,
  };
}

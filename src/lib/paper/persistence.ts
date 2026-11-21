import { z } from "zod";
import { createAccount, DEFAULT_STARTING_BALANCE, type PaperAccount } from "./engine";

export const PAPER_STORE_VERSION = 1;

const finite = z.number().finite();
const sideSchema = z.enum(["long", "short"]);

const positionSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: sideSchema,
  size: finite.positive(),
  entryPrice: finite.positive(),
  openedAt: finite,
  stopLoss: finite.nullable(),
  takeProfit: finite.nullable(),
  entryFee: finite.nonnegative(),
  initialRisk: finite.nullable(),
});

const tradeSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: sideSchema,
  size: finite.positive(),
  entryPrice: finite.positive(),
  exitPrice: finite.positive(),
  openedAt: finite,
  closedAt: finite,
  grossPnl: finite,
  fees: finite.nonnegative(),
  netPnl: finite,
  rMultiple: finite.nullable(),
  reason: z.enum(["manual", "stop-loss", "take-profit"]),
  stopLoss: finite.nullable(),
  takeProfit: finite.nullable(),
  note: z.string(),
});

export const accountSchema = z.object({
  startingBalance: finite.positive(),
  balance: finite,
  feeRate: finite.nonnegative().lt(0.05),
  leverageCap: finite.min(1).max(50),
  positions: z.array(positionSchema),
  trades: z.array(tradeSchema),
  createdAt: finite,
});

/**
 * Validates persisted paper state. Corrupt or unknown-version data is NOT
 * silently merged: it is replaced by a fresh account (the raw blob remains in
 * localStorage under the same key until the next write).
 */
export function migratePaperState(persisted: unknown): { account: PaperAccount } {
  const candidate = (persisted as { account?: unknown } | null | undefined)?.account;
  const parsed = accountSchema.safeParse(candidate);
  if (parsed.success) return { account: parsed.data };
  return { account: createAccount(Date.now(), DEFAULT_STARTING_BALANCE) };
}

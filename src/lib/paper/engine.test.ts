import { describe, expect, it } from "vitest";
import {
  accountMetrics,
  closePosition,
  createAccount,
  findTriggers,
  openPosition,
  updateProtection,
  type PaperAccount,
  type PaperQuote,
} from "./engine";
import { migratePaperState } from "./persistence";

const q = (bid: number, ask: number): PaperQuote => ({ bid, ask, time: 0 });

function account(): PaperAccount {
  return { ...createAccount(0, 10_000), feeRate: 0.001, leverageCap: 10 };
}

function mustOpen(a: PaperAccount, order: Parameters<typeof openPosition>[1], quote: PaperQuote) {
  const r = openPosition(a, order, quote, { [order.symbol]: quote }, 1000);
  if (!r.ok) throw new Error(r.error);
  return r.account;
}

describe("paper engine", () => {
  it("fills longs at the ask, charges the entry fee, and realises PnL at the bid", () => {
    let a = mustOpen(account(), { id: "p1", symbol: "BTC", side: "long", size: 10, stopLoss: 96, takeProfit: null }, q(99, 101));
    expect(a.positions[0].entryPrice).toBe(101);
    expect(a.positions[0].entryFee).toBeCloseTo(1.01, 12);
    expect(a.balance).toBeCloseTo(9998.99, 10);
    expect(a.positions[0].initialRisk).toBe(50);

    const r = closePosition(a, "p1", q(110, 111), "manual", 2000);
    if (!r.ok) throw new Error(r.error);
    a = r.account;
    const t = a.trades[0];
    expect(t.exitPrice).toBe(110);
    expect(t.grossPnl).toBe(90);
    expect(t.fees).toBeCloseTo(1.01 + 1.1, 10);
    expect(t.netPnl).toBeCloseTo(87.89, 10);
    expect(t.rMultiple).toBeCloseTo(87.89 / 50, 10);
    // Cash conservation: final balance = start + net PnL.
    expect(a.balance).toBeCloseTo(10_000 + t.netPnl, 10);
    expect(a.positions).toHaveLength(0);
  });

  it("fills shorts at the bid and closes at the ask", () => {
    const a = mustOpen(account(), { id: "s1", symbol: "ETH", side: "short", size: 2, stopLoss: null, takeProfit: null }, q(99, 101));
    expect(a.positions[0].entryPrice).toBe(99);
    const r = closePosition(a, "s1", q(89, 90), "manual", 2);
    if (!r.ok) throw new Error(r.error);
    expect(r.account.trades[0].grossPnl).toBe(18);
    expect(r.account.trades[0].rMultiple).toBeNull();
  });

  it("rejects orders without a quote, with bad sizes, or with misplaced protection", () => {
    const a = account();
    expect(openPosition(a, { id: "x", symbol: "BTC", side: "long", size: 1, stopLoss: null, takeProfit: null }, undefined, {}, 0).ok).toBe(false);
    expect(openPosition(a, { id: "x", symbol: "BTC", side: "long", size: 0, stopLoss: null, takeProfit: null }, q(99, 101), {}, 0).ok).toBe(false);
    const badSl = openPosition(a, { id: "x", symbol: "BTC", side: "long", size: 1, stopLoss: 99.5, takeProfit: null }, q(99, 101), {}, 0);
    expect(badSl.ok).toBe(false);
    const badTp = openPosition(a, { id: "x", symbol: "BTC", side: "short", size: 1, stopLoss: null, takeProfit: 102 }, q(99, 101), {}, 0);
    expect(badTp.ok).toBe(false);
  });

  it("rejects a crossed book", () => {
    const r = openPosition(account(), { id: "x", symbol: "BTC", side: "long", size: 1, stopLoss: null, takeProfit: null }, q(101, 99), {}, 0);
    expect(r.ok).toBe(false);
  });

  it("enforces the simulated leverage cap on gross exposure", () => {
    const a = { ...account(), leverageCap: 2 };
    // equity ≈ 10k, cap 2× → ~20k notional; 250 × 101 = 25,250 > cap
    const r = openPosition(a, { id: "x", symbol: "BTC", side: "long", size: 250, stopLoss: null, takeProfit: null }, q(99, 101), {}, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("leverage cap");
    const ok = openPosition(a, { id: "y", symbol: "BTC", side: "long", size: 150, stopLoss: null, takeProfit: null }, q(99, 101), {}, 0);
    expect(ok.ok).toBe(true);
  });

  it("triggers stops and targets on the exit side of the book", () => {
    let a = mustOpen(account(), { id: "L", symbol: "BTC", side: "long", size: 1, stopLoss: 95, takeProfit: 110 }, q(99, 101));
    a = mustOpen(a, { id: "S", symbol: "BTC", side: "short", size: 1, stopLoss: 105, takeProfit: 90 }, q(99, 101));
    expect(findTriggers(a, "BTC", q(98, 100))).toEqual([]);
    expect(findTriggers(a, "BTC", q(95, 96))).toEqual([{ positionId: "L", reason: "stop-loss" }]);
    expect(findTriggers(a, "BTC", q(110, 111))).toEqual([
      { positionId: "L", reason: "take-profit" },
      { positionId: "S", reason: "stop-loss" },
    ]);
    expect(findTriggers(a, "BTC", q(89, 90))).toEqual([
      { positionId: "L", reason: "stop-loss" },
      { positionId: "S", reason: "take-profit" },
    ]);
    expect(findTriggers(a, "ETH", q(1, 2))).toEqual([]);
  });

  it("fills a gapped stop at the observed price, not the trigger level", () => {
    const a = mustOpen(account(), { id: "L", symbol: "BTC", side: "long", size: 1, stopLoss: 95, takeProfit: null }, q(99, 101));
    const r = closePosition(a, "L", q(90, 91), "stop-loss", 5);
    if (!r.ok) throw new Error(r.error);
    expect(r.account.trades[0].exitPrice).toBe(90);
    expect(r.account.trades[0].rMultiple!).toBeLessThan(-1);
  });

  it("validates protection edits against the live book", () => {
    const a = mustOpen(account(), { id: "L", symbol: "BTC", side: "long", size: 1, stopLoss: null, takeProfit: null }, q(99, 101));
    expect(updateProtection(a, "L", 100, null, q(99, 101)).ok).toBe(false);
    const ok = updateProtection(a, "L", 97, 120, q(99, 101));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.account.positions[0]).toMatchObject({ stopLoss: 97, takeProfit: 120 });
  });

  it("marks equity to the exit side and flags missing quotes", () => {
    const a = mustOpen(account(), { id: "L", symbol: "BTC", side: "long", size: 2, stopLoss: null, takeProfit: null }, q(99, 101));
    const m = accountMetrics(a, { BTC: q(100, 102) });
    expect(m.unrealized).toBe(-2); // (100 − 101) × 2
    expect(m.equity).toBeCloseTo(a.balance - 2, 10);
    expect(m.equityIncomplete).toBe(false);
    expect(accountMetrics(a, {}).equityIncomplete).toBe(true);
  });
});

describe("paper persistence", () => {
  it("accepts a valid persisted account", () => {
    const acc = account();
    expect(migratePaperState({ account: acc }).account).toEqual(acc);
  });

  it.each([null, undefined, {}, { account: { balance: "lots" } }, { account: { ...account(), feeRate: 2 } }])(
    "replaces corrupt state %o with a fresh $10,000 account",
    (bad) => {
      const r = migratePaperState(bad).account;
      expect(r.balance).toBe(10_000);
      expect(r.positions).toEqual([]);
    },
  );
});

import { describe, expect, it } from "vitest";
import { calcPositionSize, type PositionSizeInput } from "./position-size";

const base: PositionSizeInput = {
  equity: 10_000,
  riskPct: 1,
  entry: 100,
  stop: 95,
  rewardMultiple: 2,
  feeRate: 0,
  includeFees: false,
  szDecimals: 2,
};

describe("calcPositionSize", () => {
  it("sizes a long from equity × risk ÷ stop distance", () => {
    const r = calcPositionSize(base);
    if (!r.ok) throw new Error(r.error);
    expect(r.side).toBe("long");
    expect(r.riskBudget).toBe(100);
    expect(r.size).toBe(20);
    expect(r.notional).toBe(2000);
    expect(r.riskAtStop).toBe(100);
    expect(r.takeProfit).toBe(110);
    expect(r.rr).toBe(2);
    expect(r.leverage).toBeCloseTo(0.2, 12);
    expect(r.warnings).toEqual([]);
  });

  it("infers a short when the stop is above entry", () => {
    const r = calcPositionSize({ ...base, stop: 105 });
    if (!r.ok) throw new Error(r.error);
    expect(r.side).toBe("short");
    expect(r.takeProfit).toBe(90);
    expect(r.size).toBe(20);
  });

  it("budgets round-trip fees inside the risk and floors the size", () => {
    const r = calcPositionSize({ ...base, feeRate: 0.001, includeFees: true });
    if (!r.ok) throw new Error(r.error);
    // loss per unit = 5 + 0.001 × (100 + 95) = 5.195 → 100 / 5.195 = 19.249… → 19.24
    expect(r.size).toBe(19.24);
    expect(r.riskAtStop).toBeCloseTo(19.24 * 5.195, 10);
    expect(r.riskAtStop).toBeLessThanOrEqual(r.riskBudget);
    expect(r.netRr).toBeLessThan(r.rr);
  });

  it("never exceeds the risk budget across random inputs", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 2000; i++) {
      const entry = 1 + rnd() * 100_000;
      const stop = entry * (1 + (rnd() - 0.5) * 0.2);
      const r = calcPositionSize({
        equity: 100 + rnd() * 1_000_000,
        riskPct: 0.1 + rnd() * 5,
        entry,
        stop,
        rewardMultiple: 0.5 + rnd() * 5,
        feeRate: rnd() * 0.001,
        includeFees: rnd() > 0.5,
        szDecimals: Math.floor(rnd() * 6),
      });
      if (r.ok) expect(r.riskAtStop).toBeLessThanOrEqual(r.riskBudget * (1 + 1e-12));
    }
  });

  it("warns when the position requires leverage", () => {
    const r = calcPositionSize({ ...base, stop: 99.5 });
    if (!r.ok) throw new Error(r.error);
    expect(r.size).toBe(200);
    expect(r.leverage).toBeCloseTo(2, 12);
    expect(r.warnings.some((w) => w.includes("leverage"))).toBe(true);
  });

  it.each([
    [{ stop: 100 }, "cannot equal entry"],
    [{ equity: 0 }, "equity"],
    [{ riskPct: 0 }, "Risk"],
    [{ riskPct: 150 }, "Risk"],
    [{ entry: -1 }, "Entry"],
    [{ side: "short" as const }, "Short stop-loss must be above entry"],
    [{ side: "long" as const, stop: 105 }, "Long stop-loss must be below entry"],
    [{ equity: 10, szDecimals: 1 }, "minimum lot"],
    [{ entry: Number.NaN }, "Entry"],
  ])("rejects invalid input %o", (patch, msg) => {
    const r = calcPositionSize({ ...base, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
});

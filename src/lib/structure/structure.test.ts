import { describe, expect, it } from "vitest";
import { analyzeStructure, detectFVGs, detectSwings, DEFAULT_STRUCTURE_CONFIG, type OHLC, type StructureConfig } from ".";

/** Builds candles from [high, low, close] triples; open = previous close (or close). */
function bars(rows: Array<[number, number, number]>): OHLC[] {
  return rows.map(([high, low, close], i) => ({
    time: i * 60_000,
    open: i === 0 ? close : rows[i - 1][2],
    high,
    low,
    close,
  }));
}

const cfg = (patch: Partial<StructureConfig> = {}): StructureConfig => ({
  ...DEFAULT_STRUCTURE_CONFIG,
  left: 1,
  right: 1,
  fvgMinGapPct: 0,
  ...patch,
});

describe("detectSwings", () => {
  it("finds a fractal high/low and records the confirming index", () => {
    const c = bars([
      [1, 0.5, 0.8],
      [2, 1, 1.5],
      [3, 2, 2.5],
      [2, 1.2, 1.4],
      [1, 0.2, 0.4],
    ]);
    const s = detectSwings(c, { left: 2, right: 2 });
    expect(s).toEqual([{ kind: "high", index: 2, time: 120_000, price: 3, confirmedIndex: 4, label: null }]);
  });

  it("does not emit a pivot until `right` bars have closed (no look-ahead)", () => {
    const c = bars([
      [1, 0.5, 0.8],
      [2, 1, 1.5],
      [3, 2, 2.5],
      [2, 1.2, 1.4],
    ]);
    expect(detectSwings(c, { left: 2, right: 2 })).toEqual([]);
  });

  it("resolves equal highs to the first bar of the run", () => {
    const c = bars([
      [1, 0.5, 0.8],
      [3, 1, 2],
      [3, 1.5, 2],
      [1, 0.6, 0.7],
    ]);
    const highs = detectSwings(c, { left: 1, right: 1 }).filter((s) => s.kind === "high");
    expect(highs.map((h) => h.index)).toEqual([1]);
  });

  it("labels HH / LH / HL / LL relative to the previous swing of the same kind", () => {
    const c = bars([
      [10, 8, 9],
      [12, 9, 11],
      [11, 9.5, 10],
      [10.5, 8.5, 9],
      [11, 9, 10.5],
      [13, 10, 12.5],
      [12.8, 11, 11.5],
      [12, 10.5, 11],
      [11, 7, 7.5],
    ]);
    const s = detectSwings(c, { left: 1, right: 1 });
    expect(s.map((x) => [x.kind, x.index, x.price, x.label])).toEqual([
      ["high", 1, 12, null],
      ["low", 3, 8.5, null],
      ["high", 5, 13, "HH"],
    ]);
  });
});

describe("analyzeStructure — BOS / CHoCH", () => {
  const seq = bars([
    [10, 8, 9],
    [12, 9, 11], // swing high 12 (confirmed @2)
    [11, 9.5, 10],
    [10.5, 8.5, 9], // swing low 8.5 (confirmed @4)
    [11, 9, 10.5],
    [13, 10, 12.5], // close 12.5 > 12 → BOS bullish
    [12.8, 11, 11.5],
    [12, 10.5, 11],
    [11, 7, 7.5], // close 7.5 < 8.5 against bullish trend → CHoCH bearish
  ]);

  it("emits BOS then CHoCH with correct levels and indices", () => {
    const r = analyzeStructure(seq, cfg());
    expect(r.breaks.map((b) => [b.kind, b.direction, b.level, b.swingIndex, b.breakIndex])).toEqual([
      ["BOS", "bullish", 12, 1, 5],
      ["CHoCH", "bearish", 8.5, 3, 8],
    ]);
    expect(r.trend).toBe("bearish");
  });

  it("consumes a broken level so it cannot break twice", () => {
    const extended = bars([
      [10, 8, 9],
      [12, 9, 11],
      [11, 9.5, 10],
      [13, 10, 12.5], // BOS of 12
      [12.9, 12, 12.2],
      [12.95, 12.1, 12.6], // still above 12: no second break
    ]);
    const r = analyzeStructure(extended, cfg());
    expect(r.breaks.filter((b) => b.level === 12)).toHaveLength(1);
  });
});

describe("analyzeStructure — liquidity sweeps & break mode", () => {
  const sweepSeq = bars([
    [10, 8, 9],
    [12, 9, 11], // swing high 12
    [11, 9.5, 10],
    [12.5, 10, 11.5], // wick to 12.5, close 11.5 back below 12
  ]);

  it("records a bearish sweep and no break when breaks require a close", () => {
    const r = analyzeStructure(sweepSeq, cfg({ breakOn: "close" }));
    expect(r.sweeps).toEqual([
      { direction: "bearish", level: 12, swingIndex: 1, swingTime: 60_000, index: 3, time: 180_000, extreme: 12.5 },
    ]);
    expect(r.breaks).toEqual([]);
  });

  it("treats the same wick as a BOS in wick mode (sweep still recorded)", () => {
    const r = analyzeStructure(sweepSeq, cfg({ breakOn: "wick" }));
    expect(r.breaks.map((b) => [b.kind, b.direction, b.level, b.breakIndex])).toEqual([["BOS", "bullish", 12, 3]]);
    expect(r.sweeps).toHaveLength(1);
  });

  it("records a bullish sweep of a swing low", () => {
    const r = analyzeStructure(
      bars([
        [12, 10, 11],
        [11, 8, 9], // swing low 8
        [11.5, 9, 11],
        [11, 7.5, 9.5], // wick to 7.5, close 9.5 back above
      ]),
      cfg(),
    );
    expect(r.sweeps.map((s) => [s.direction, s.level, s.index, s.extreme])).toEqual([["bullish", 8, 3, 7.5]]);
  });

  it("a pool closed through is removed without a sweep", () => {
    const r = analyzeStructure(
      bars([
        [10, 8, 9],
        [12, 9, 11],
        [11, 9.5, 10],
        [13, 10, 12.5], // closes through 12 → BOS, not a sweep
        [12.7, 11, 11.2],
      ]),
      cfg(),
    );
    expect(r.sweeps).toEqual([]);
  });
});

describe("detectFVGs", () => {
  const base = bars([
    [10, 8, 9.5], // a
    [14, 9.5, 13.5], // b (displacement)
    [16, 12, 15], // c: low 12 > a.high 10 → bullish gap [10, 12]
  ]);

  it("detects a bullish gap with exact bounds", () => {
    const g = detectFVGs(base, 0);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ direction: "bullish", bottom: 10, top: 12, startIndex: 0, createdIndex: 2, status: "open", fillPct: 0 });
  });

  it("tracks partial then full mitigation on later candles only", () => {
    const c = [
      ...base,
      { time: 3 * 60_000, open: 15, high: 15.5, low: 11, close: 14 }, // 50% fill
      { time: 4 * 60_000, open: 14, high: 14.5, low: 9.9, close: 10.5 }, // through the bottom
    ];
    const g = detectFVGs(c, 0)[0];
    expect(g.status).toBe("filled");
    expect(g.filledIndex).toBe(4);
    expect(g.fillPct).toBe(1);

    const partial = detectFVGs(c.slice(0, 4), 0)[0];
    expect(partial.status).toBe("partial");
    expect(partial.fillPct).toBeCloseTo(0.5, 10);
  });

  it("detects a bearish gap", () => {
    const g = detectFVGs(
      bars([
        [16, 14, 14.5],
        [14.5, 10, 10.5],
        [12, 9, 9.5], // high 12 < a.low 14 → bearish gap [12, 14]
      ]),
      0,
    );
    expect(g.map((x) => [x.direction, x.bottom, x.top])).toEqual([["bearish", 12, 14]]);
  });

  it("filters gaps below the minimum size", () => {
    expect(detectFVGs(base, 0.2)).toHaveLength(0); // gap 2 / ref 13.5 ≈ 14.8%
    expect(detectFVGs(base, 0.1)).toHaveLength(1);
  });
});

/** Deterministic pseudo-random walk (mulberry32). */
function randomWalk(n: number, seed: number): OHLC[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: OHLC[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = open * (1 + (rnd() - 0.5) * 0.02);
    const high = Math.max(open, close) * (1 + rnd() * 0.006);
    const low = Math.min(open, close) * (1 - rnd() * 0.006);
    out.push({ time: i * 60_000, open, high, low, close });
    price = close;
  }
  return out;
}

describe("look-ahead bias (prefix invariance)", () => {
  // Any event known after k candles must be identical whether computed on the
  // prefix or on the full history. If an algorithm peeked ahead, prefix results
  // would differ from (or be missing in) the full run.
  for (const seed of [1, 7, 42]) {
    it(`events on every prefix match the full-history run (seed ${seed})`, () => {
      const all = randomWalk(260, seed);
      const config = cfg({ left: 3, right: 2, fvgMinGapPct: 0.0005 });
      const full = analyzeStructure(all, config);
      expect(full.breaks.length).toBeGreaterThan(0);
      expect(full.sweeps.length).toBeGreaterThan(0);
      expect(full.fvgs.length).toBeGreaterThan(0);

      for (let k = 10; k <= all.length; k += 7) {
        const pre = analyzeStructure(all.slice(0, k), config);
        expect(pre.swings).toEqual(full.swings.filter((s) => s.confirmedIndex <= k - 1));
        expect(pre.breaks).toEqual(full.breaks.filter((b) => b.breakIndex <= k - 1));
        expect(pre.sweeps).toEqual(full.sweeps.filter((s) => s.index <= k - 1));
        const strip = (g: { createdIndex: number; top: number; bottom: number; direction: string }) =>
          `${g.direction}:${g.createdIndex}:${g.top}:${g.bottom}`;
        expect(pre.fvgs.map(strip)).toEqual(full.fvgs.filter((g) => g.createdIndex <= k - 1).map(strip));
      }
    });
  }
});

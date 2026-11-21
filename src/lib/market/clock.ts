/**
 * Estimates venue-clock minus local-clock from (serverEventTime, localReceiveTime) pairs.
 * Each sample equals trueOffset − oneWayLatency, so the MAXIMUM over a window is the
 * tightest estimate (the sample with the least latency). A sliding window lets the
 * estimate follow local clock adjustments.
 */
export class ClockSync {
  private samples: number[] = [];

  constructor(private readonly windowSize = 200) {}

  add(serverMs: number, localMs: number): void {
    if (!Number.isFinite(serverMs) || !Number.isFinite(localMs)) return;
    this.samples.push(serverMs - localMs);
    if (this.samples.length > this.windowSize) this.samples.shift();
  }

  /** Null until at least 5 samples have been collected. */
  offset(): number | null {
    if (this.samples.length < 5) return null;
    let best = -Infinity;
    for (const s of this.samples) if (s > best) best = s;
    return best;
  }

  reset(): void {
    this.samples = [];
  }
}

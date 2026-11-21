export type Clock = () => number;

export type TokenBucketOptions = {
  readonly burstPerSec: number;
  readonly sustainedPerSec: number;
  readonly sustainedWindowSec: number;
  readonly clock?: Clock;
};

/**
 * Conservative dual-limit bucket: max `burstPerSec` admissions in any 1s window,
 * plus sustained cap over a sliding window.
 */
export class HostTokenBucket {
  private readonly burstPerSec: number;
  private readonly sustainedPerSec: number;
  private readonly sustainedWindowMs: number;
  private readonly clock: Clock;
  private readonly perSecondWindow: number[] = [];
  private readonly sustainedWindow: number[] = [];

  constructor(options: TokenBucketOptions) {
    this.burstPerSec = options.burstPerSec;
    this.sustainedPerSec = options.sustainedPerSec;
    this.sustainedWindowMs = options.sustainedWindowSec * 1000;
    this.clock = options.clock ?? (() => Date.now());
  }

  private prune(): void {
    const now = this.clock();
    const secCutoff = now - 1000;
    const sustainedCutoff = now - this.sustainedWindowMs;
    while (this.perSecondWindow.length > 0 && this.perSecondWindow[0]! < secCutoff) {
      this.perSecondWindow.shift();
    }
    while (this.sustainedWindow.length > 0 && this.sustainedWindow[0]! < sustainedCutoff) {
      this.sustainedWindow.shift();
    }
  }

  /** Returns ms to wait before a token is available (0 = ready now). */
  acquire(): number {
    this.prune();
    const now = this.clock();

    if (this.perSecondWindow.length >= this.burstPerSec) {
      const oldest = this.perSecondWindow[0]!;
      return Math.max(1, oldest + 1000 - now);
    }

    const sustainedCap = Math.floor(
      this.sustainedPerSec * (this.sustainedWindowMs / 1000),
    );
    if (this.sustainedWindow.length >= sustainedCap) {
      const oldest = this.sustainedWindow[0]!;
      return Math.max(1, oldest + this.sustainedWindowMs - now);
    }

    this.perSecondWindow.push(now);
    this.sustainedWindow.push(now);
    return 0;
  }

}
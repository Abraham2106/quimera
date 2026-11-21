export class HostCircuitBreaker {
  private openUntilMs = 0;
  private readonly clock: () => number;

  constructor(clock: () => number = () => Date.now()) {
    this.clock = clock;
  }

  isOpen(): boolean {
    return this.clock() < this.openUntilMs;
  }

  openForSeconds(seconds: number): void {
    const until = this.clock() + seconds * 1000;
    this.openUntilMs = Math.max(this.openUntilMs, until);
  }

  reset(): void {
    this.openUntilMs = 0;
  }

  secondsRemaining(): number {
    const rem = (this.openUntilMs - this.clock()) / 1000;
    return rem > 0 ? Math.ceil(rem) : 0;
  }
}
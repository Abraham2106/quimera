export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Per-host circuit breaker with an explicit half-open stage: once the cooldown
 * expires exactly one trial request is admitted, and its outcome closes or
 * re-opens the breaker.
 */
export class HostCircuitBreaker {
  private openUntilMs = 0;
  private halfOpenInFlight = false;
  private readonly clock: () => number;

  constructor(clock: () => number = () => Date.now()) {
    this.clock = clock;
  }

  state(): BreakerState {
    if (this.openUntilMs === 0) {
      return "CLOSED";
    }
    return this.clock() < this.openUntilMs ? "OPEN" : "HALF_OPEN";
  }

  isOpen(): boolean {
    return this.state() === "OPEN";
  }

  isHalfOpen(): boolean {
    return this.state() === "HALF_OPEN";
  }

  /** Reserve the single trial request allowed while the breaker is half-open. */
  tryHalfOpen(): boolean {
    if (!this.isHalfOpen() || this.halfOpenInFlight) {
      return false;
    }
    this.halfOpenInFlight = true;
    return true;
  }

  openForSeconds(seconds: number): void {
    const until = this.clock() + Math.max(0, seconds) * 1000;
    this.openUntilMs = Math.max(this.openUntilMs, until);
    this.halfOpenInFlight = false;
  }

  /** Close the breaker after a healthy response (including a half-open trial). */
  recordSuccess(): void {
    this.reset();
  }

  /** Re-open the breaker after a failed half-open trial or upstream error. */
  recordFailure(seconds: number): void {
    this.openForSeconds(seconds);
  }

  reset(): void {
    this.openUntilMs = 0;
    this.halfOpenInFlight = false;
  }

  secondsRemaining(): number {
    const rem = (this.openUntilMs - this.clock()) / 1000;
    return rem > 0 ? Math.ceil(rem) : 0;
  }
}

/**
 * Automatic idle GPU shutdown (Phase 13).
 * Never leave a paid GPU running indefinitely.
 */
export type IdleShutdownEvent =
  | 'worker_started'
  | 'worker_active'
  | 'queue_empty'
  | 'idle_timer'
  | 'shutdown_requested'
  | 'shutdown_confirmed';

export type IdleShutdownLogEntry = {
  at: string;
  event: IdleShutdownEvent;
  detail?: string;
};

export class IdleShutdownController {
  private lastActiveAt = Date.now();
  private queueEmptySince: number | null = null;
  private shutdownRequested = false;
  private shutdownConfirmed = false;
  readonly log: IdleShutdownLogEntry[] = [];

  constructor(
    private readonly idleShutdownMinutes: number,
    private readonly terminate: () => Promise<void>,
  ) {
    this.record('worker_started', `idle timeout=${idleShutdownMinutes}m`);
  }

  markActive(detail?: string) {
    this.lastActiveAt = Date.now();
    this.queueEmptySince = null;
    this.record('worker_active', detail);
  }

  markQueueEmpty() {
    if (this.queueEmptySince == null) {
      this.queueEmptySince = Date.now();
      this.record('queue_empty');
    }
  }

  markQueueNonEmpty() {
    this.queueEmptySince = null;
  }

  idleSeconds(): number {
    if (this.queueEmptySince == null) return 0;
    return (Date.now() - this.queueEmptySince) / 1000;
  }

  shouldShutdown(now = Date.now()): boolean {
    if (this.shutdownConfirmed) return false;
    if (this.queueEmptySince == null) return false;
    const idleMs = now - this.queueEmptySince;
    return idleMs >= this.idleShutdownMinutes * 60_000;
  }

  async tick(): Promise<{ shutdown: boolean }> {
    if (!this.shouldShutdown()) {
      if (this.queueEmptySince != null) {
        this.record('idle_timer', `idleSeconds=${this.idleSeconds().toFixed(1)}`);
      }
      return { shutdown: false };
    }
    this.shutdownRequested = true;
    this.record('shutdown_requested', 'queue empty AND idle timeout reached');
    await this.terminate();
    this.shutdownConfirmed = true;
    this.record('shutdown_confirmed');
    return { shutdown: true };
  }

  getState() {
    return {
      lastActiveAt: this.lastActiveAt,
      queueEmptySince: this.queueEmptySince,
      idleSeconds: this.idleSeconds(),
      shutdownRequested: this.shutdownRequested,
      shutdownConfirmed: this.shutdownConfirmed,
      idleShutdownMinutes: this.idleShutdownMinutes,
      log: [...this.log],
    };
  }

  private record(event: IdleShutdownEvent, detail?: string) {
    this.log.push({ at: new Date().toISOString(), event, detail });
  }
}

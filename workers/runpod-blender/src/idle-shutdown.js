/**
 * Idle shutdown controller for paid GPU workers.
 */
class IdleShutdownController {
  constructor(idleShutdownMinutes, terminateFn) {
    this.idleShutdownMinutes = idleShutdownMinutes;
    this.terminateFn = terminateFn;
    this.queueEmptySince = null;
    this.shutdownRequested = false;
    this.shutdownConfirmed = false;
    this.log = [];
    this.record('worker_started', `idle timeout=${idleShutdownMinutes}m`);
  }

  markActive(detail) {
    this.queueEmptySince = null;
    this.record('worker_active', detail);
  }

  markQueueEmpty() {
    if (this.queueEmptySince == null) {
      this.queueEmptySince = Date.now();
      this.record('queue_empty');
    }
  }

  shouldShutdown(now = Date.now()) {
    if (this.shutdownConfirmed || this.queueEmptySince == null) return false;
    return now - this.queueEmptySince >= this.idleShutdownMinutes * 60_000;
  }

  async tick() {
    if (!this.shouldShutdown()) {
      if (this.queueEmptySince != null) {
        this.record('idle_timer', `idleMs=${Date.now() - this.queueEmptySince}`);
      }
      return { shutdown: false };
    }
    this.shutdownRequested = true;
    this.record('shutdown_requested', 'queue empty AND idle timeout reached');
    await this.terminateFn();
    this.shutdownConfirmed = true;
    this.record('shutdown_confirmed');
    return { shutdown: true };
  }

  record(event, detail) {
    this.log.push({ at: new Date().toISOString(), event, detail });
    console.log(JSON.stringify({ type: 'idle_shutdown', event, detail }));
  }
}

module.exports = { IdleShutdownController };

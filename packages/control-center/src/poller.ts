import type { ControlCenterOrchestrator } from "./orchestrator";

export class StatusPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  ticks = 0;

  constructor(
    private readonly orch: ControlCenterOrchestrator,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    // unref so tests/process can exit
    if (typeof this.timer === "object" && "unref" in this.timer) {
      (this.timer as NodeJS.Timeout).unref();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.ticks += 1;
    try {
      if (this.orch.isKillSwitchEnabled()) return;
      const active = this.orch.store.listJobs().filter((j) =>
        ["dispatched", "running", "cancel_pending", "dispatching"].includes(j.status),
      );
      for (const job of active) {
        if (job.cursorAgentId) {
          await this.orch.reconcileJob(job.id, "poller");
        }
      }
    } finally {
      this.running = false;
    }
  }
}

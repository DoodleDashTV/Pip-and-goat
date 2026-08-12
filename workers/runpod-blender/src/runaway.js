/**
 * Runaway / stalled render protection for GPU worker.
 */
class RunawayRenderGuard {
  constructor(config = {}) {
    this.config = {
      maxSecondsWithoutFrameProgress: config.maxSecondsWithoutFrameProgress ?? 300,
      maxJobRuntimeMinutes: config.maxJobRuntimeMinutes ?? 180,
      maxSecondsWithoutHeartbeat: config.maxSecondsWithoutHeartbeat ?? 120,
      maxFfmpegSeconds: config.maxFfmpegSeconds ?? 600,
    };
    this.lastFrameAt = Date.now();
    this.lastHeartbeatAt = Date.now();
    this.startedAt = Date.now();
    this.lastFrameNumber = 0;
    this.ffmpegStartedAt = null;
    this.uploadFailed = false;
  }

  markHeartbeat() {
    this.lastHeartbeatAt = Date.now();
  }

  markFrame(n) {
    if (n > this.lastFrameNumber) {
      this.lastFrameNumber = n;
      this.lastFrameAt = Date.now();
    }
  }

  markFfmpegStart() {
    this.ffmpegStartedAt = Date.now();
  }

  markFfmpegDone() {
    this.ffmpegStartedAt = null;
  }

  markUploadFailed() {
    this.uploadFailed = true;
  }

  evaluate(now = Date.now()) {
    if ((now - this.startedAt) / 60000 > this.config.maxJobRuntimeMinutes) {
      return { stalled: true, reason: 'MAX_JOB_RUNTIME', shouldCancel: true, shouldTerminateGpu: true };
    }
    if ((now - this.lastHeartbeatAt) / 1000 > this.config.maxSecondsWithoutHeartbeat) {
      return {
        stalled: true,
        reason: 'WORKER_HEARTBEAT_FAILURE',
        shouldCancel: true,
        shouldTerminateGpu: true,
      };
    }
    if ((now - this.lastFrameAt) / 1000 > this.config.maxSecondsWithoutFrameProgress) {
      return { stalled: true, reason: 'NO_FRAME_PROGRESS', shouldCancel: true, shouldTerminateGpu: true };
    }
    if (this.ffmpegStartedAt && (now - this.ffmpegStartedAt) / 1000 > this.config.maxFfmpegSeconds) {
      return { stalled: true, reason: 'HUNG_FFMPEG', shouldCancel: true, shouldTerminateGpu: true };
    }
    if (this.uploadFailed) {
      return { stalled: true, reason: 'FAILED_UPLOAD', shouldCancel: true, shouldTerminateGpu: true };
    }
    return { stalled: false, shouldCancel: false, shouldTerminateGpu: false };
  }
}

module.exports = { RunawayRenderGuard };

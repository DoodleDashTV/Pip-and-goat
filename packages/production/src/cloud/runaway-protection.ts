/**
 * Runaway / stalled render protection (Phase 14).
 */
export type RunawayReason =
  | 'STALLED_BLENDER'
  | 'NO_FRAME_PROGRESS'
  | 'EXCESSIVE_FRAME_TIME'
  | 'HUNG_FFMPEG'
  | 'FAILED_UPLOAD'
  | 'WORKER_HEARTBEAT_FAILURE'
  | 'MAX_JOB_RUNTIME';

export type RunawayCheckResult = {
  stalled: boolean;
  reason?: RunawayReason;
  message?: string;
  shouldCancel: boolean;
  shouldTerminateGpu: boolean;
};

export type RunawayConfig = {
  maxSecondsWithoutFrameProgress: number;
  maxSecondsPerFrame: number;
  maxJobRuntimeMinutes: number;
  maxSecondsWithoutHeartbeat: number;
  maxFfmpegSeconds: number;
};

export const DEFAULT_RUNAWAY_CONFIG: RunawayConfig = {
  maxSecondsWithoutFrameProgress: 300,
  maxSecondsPerFrame: 120,
  maxJobRuntimeMinutes: 180,
  maxSecondsWithoutHeartbeat: 120,
  maxFfmpegSeconds: 600,
};

export class RunawayRenderGuard {
  private lastFrameAt = Date.now();
  private lastHeartbeatAt = Date.now();
  private startedAt = Date.now();
  private lastFrameNumber = 0;
  private ffmpegStartedAt: number | null = null;
  private uploadFailed = false;

  constructor(private readonly config: RunawayConfig = DEFAULT_RUNAWAY_CONFIG) {}

  markHeartbeat() {
    this.lastHeartbeatAt = Date.now();
  }

  markFrame(frameNumber: number) {
    if (frameNumber > this.lastFrameNumber) {
      this.lastFrameNumber = frameNumber;
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

  evaluate(now = Date.now()): RunawayCheckResult {
    const runtimeMinutes = (now - this.startedAt) / 60_000;
    if (runtimeMinutes > this.config.maxJobRuntimeMinutes) {
      return fail('MAX_JOB_RUNTIME', `Job exceeded MAX_JOB_RUNTIME_MINUTES=${this.config.maxJobRuntimeMinutes}`, true);
    }
    if ((now - this.lastHeartbeatAt) / 1000 > this.config.maxSecondsWithoutHeartbeat) {
      return fail('WORKER_HEARTBEAT_FAILURE', 'Worker heartbeat stalled', true);
    }
    if ((now - this.lastFrameAt) / 1000 > this.config.maxSecondsWithoutFrameProgress) {
      return fail('NO_FRAME_PROGRESS', 'No frame progress within configured limit', true);
    }
    if (this.ffmpegStartedAt && (now - this.ffmpegStartedAt) / 1000 > this.config.maxFfmpegSeconds) {
      return fail('HUNG_FFMPEG', 'FFmpeg exceeded max runtime', true);
    }
    if (this.uploadFailed) {
      return fail('FAILED_UPLOAD', 'Output upload failed', true);
    }
    return { stalled: false, shouldCancel: false, shouldTerminateGpu: false };
  }
}

function fail(
  reason: RunawayReason,
  message: string,
  terminateGpu: boolean,
): RunawayCheckResult {
  return {
    stalled: true,
    reason,
    message,
    shouldCancel: true,
    shouldTerminateGpu: terminateGpu,
  };
}

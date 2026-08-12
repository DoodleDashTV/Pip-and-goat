/**
 * RenderProvider abstraction (Phase 4).
 * Extends existing local Blender path — does NOT replace LocalBlenderProvider.
 */
import { detectBlenderBinary } from '../launch-prep';
import type {
  CloudJobManifest,
  CostEstimate,
  RenderProviderHealth,
  RenderProviderId,
  CloudRenderStatusView,
} from './types';
import { estimateCloudRenderCost } from './cost-estimation';
import { CloudCostGuardrails } from './cost-guardrails';
import { runpodAuthSelfTest, RunpodClient } from './runpod-client';
import { resolveCloudCostLimitsFromEnv } from './config';
import { AppError } from '@doodle-dash/shared';

export type SubmitRenderResult = {
  providerJobId: string;
  provider: RenderProviderId;
  accepted: boolean;
  message: string;
  estimate?: CostEstimate;
};

export interface RenderProvider {
  readonly id: RenderProviderId;
  submitRenderJob(manifest: CloudJobManifest): Promise<SubmitRenderResult>;
  getRenderStatus(providerJobId: string): Promise<CloudRenderStatusView>;
  cancelRenderJob(providerJobId: string): Promise<{ cancelled: boolean; message: string }>;
  fetchRenderResult(providerJobId: string): Promise<{ outputUri: string | null; logsUri?: string | null }>;
  estimateRenderCost(manifest: CloudJobManifest, gpuHourlyPriceUsd?: number): Promise<CostEstimate>;
  healthCheck(): Promise<RenderProviderHealth>;
}

/** In-memory status store for cloud provider orchestration (server-side). */
const statusStore = new Map<string, CloudRenderStatusView>();

export class LocalBlenderProvider implements RenderProvider {
  readonly id = 'LOCAL_BLENDER' as const;

  async submitRenderJob(manifest: CloudJobManifest): Promise<SubmitRenderResult> {
    const blender = detectBlenderBinary();
    if (!blender.available) {
      throw new AppError('Local Blender is not available.', 'LOCAL_BLENDER_UNAVAILABLE', 409);
    }
    const providerJobId = `local-${manifest.jobId}`;
    statusStore.set(providerJobId, {
      jobId: manifest.jobId,
      stage: 'QUEUED',
      progress: 0,
      message: 'Accepted by LocalBlenderProvider — existing DDP worker claims from render queue.',
      totalFrames: manifest.estimatedFrameCount,
    });
    return {
      providerJobId,
      provider: this.id,
      accepted: true,
      message:
        'Local job routed through existing DDP render queue / workers/blender-renderer. Local path preserved.',
    };
  }

  async getRenderStatus(providerJobId: string): Promise<CloudRenderStatusView> {
    return (
      statusStore.get(providerJobId) ?? {
        jobId: providerJobId,
        stage: 'QUEUED',
        progress: 0,
        message: 'No local provider status yet — check /api/render-jobs.',
      }
    );
  }

  async cancelRenderJob(providerJobId: string): Promise<{ cancelled: boolean; message: string }> {
    const cur = statusStore.get(providerJobId);
    if (cur) {
      statusStore.set(providerJobId, { ...cur, stage: 'FAILED', error: 'Cancelled', message: 'Cancelled' });
    }
    return { cancelled: true, message: `Cancel requested for ${providerJobId}` };
  }

  async fetchRenderResult(providerJobId: string): Promise<{ outputUri: string | null; logsUri?: string | null }> {
    const st = statusStore.get(providerJobId);
    return { outputUri: st?.outputLocation ?? null };
  }

  async estimateRenderCost(manifest: CloudJobManifest): Promise<CostEstimate> {
    return estimateCloudRenderCost({
      frameCount: manifest.estimatedFrameCount,
      resolution: manifest.resolution,
      profile: manifest.renderMode,
      gpuType: 'LOCAL_CPU_OR_GPU',
      gpuHourlyPriceUsd: 0,
      encodeOverheadMinutes: 1,
      assetSyncMinutes: 0,
    });
  }

  async healthCheck(): Promise<RenderProviderHealth> {
    const blender = detectBlenderBinary();
    return {
      provider: this.id,
      healthy: Boolean(blender.available),
      message: blender.available
        ? `Local Blender available at ${blender.bin || 'detected'}`
        : 'Local Blender binary not found',
      details: blender as unknown as Record<string, unknown>,
    };
  }
}

export class RunpodBlenderProvider implements RenderProvider {
  readonly id = 'RUNPOD_BLENDER' as const;
  private readonly sessions = new Map<
    string,
    { manifest: CloudJobManifest; podId?: string; startedAt: number; estimate?: CostEstimate }
  >();

  async submitRenderJob(manifest: CloudJobManifest): Promise<SubmitRenderResult> {
    const limits = resolveCloudCostLimitsFromEnv();
    if (!limits.cloudRenderEnabled) {
      throw new AppError(
        'Cloud render disabled (CLOUD_RENDER_ENABLED=false).',
        'CLOUD_RENDER_DISABLED',
        403,
      );
    }

    const estimate = await this.estimateRenderCost(manifest);
    const decision = new CloudCostGuardrails(limits).evaluate({
      estimate,
      paidGpuApproved: limits.allowPaidGpuLaunch,
    });
    if (!decision.allowed) {
      throw new AppError(decision.reason, decision.code, 403);
    }

    // Safety: do not auto-create GPU pods here. Queue the cloud job for an
    // already-running worker / future explicit launch (Phase 22).
    const providerJobId = `runpod-${manifest.jobId}`;
    this.sessions.set(providerJobId, {
      manifest,
      startedAt: Date.now(),
      estimate,
    });
    statusStore.set(providerJobId, {
      jobId: manifest.jobId,
      stage: 'QUEUED',
      progress: 0,
      estimatedCostUsd: estimate.estimatedCostUsd,
      gpuType: estimate.gpuType,
      totalFrames: manifest.estimatedFrameCount,
      message:
        'Cloud job accepted into DDP cloud queue. GPU will not start until ALLOW_PAID_GPU_LAUNCH and explicit approval.',
    });

    return {
      providerJobId,
      provider: this.id,
      accepted: true,
      message:
        'RunpodBlenderProvider queued job without creating a paid GPU (safety gate).',
      estimate,
    };
  }

  async getRenderStatus(providerJobId: string): Promise<CloudRenderStatusView> {
    return (
      statusStore.get(providerJobId) ?? {
        jobId: providerJobId,
        stage: 'FAILED',
        progress: 0,
        error: 'Unknown cloud provider job',
      }
    );
  }

  async cancelRenderJob(providerJobId: string): Promise<{ cancelled: boolean; message: string }> {
    const session = this.sessions.get(providerJobId);
    if (session?.podId && resolveCloudCostLimitsFromEnv().allowPaidGpuLaunch) {
      try {
        const client = new RunpodClient();
        await client.terminatePod(session.podId);
      } catch {
        // still mark cancelled locally
      }
    }
    statusStore.set(providerJobId, {
      jobId: session?.manifest.jobId ?? providerJobId,
      stage: 'FAILED',
      progress: 0,
      error: 'Cancelled',
      message: 'Cloud job cancelled',
    });
    return { cancelled: true, message: `Cancelled ${providerJobId}` };
  }

  async fetchRenderResult(providerJobId: string): Promise<{ outputUri: string | null; logsUri?: string | null }> {
    const st = statusStore.get(providerJobId);
    return { outputUri: st?.outputLocation ?? null };
  }

  async estimateRenderCost(
    manifest: CloudJobManifest,
    gpuHourlyPriceUsd = 0.34,
  ): Promise<CostEstimate> {
    return estimateCloudRenderCost({
      frameCount: manifest.estimatedFrameCount,
      resolution: manifest.resolution,
      profile: manifest.renderMode,
      gpuType: 'NVIDIA GeForce RTX 4090',
      gpuHourlyPriceUsd,
    });
  }

  async healthCheck(): Promise<RenderProviderHealth> {
    const auth = await runpodAuthSelfTest();
    return {
      provider: this.id,
      healthy: auth.ok,
      message: auth.message,
      details: {
        preferredGpuCount: auth.preferred.length,
        gpuTypesReturned: auth.gpuTypes.length,
        gpuCreated: false,
        billingStarted: false,
      },
    };
  }

  /** Test helper: update stage without billing. */
  updateStatus(providerJobId: string, patch: Partial<CloudRenderStatusView>) {
    const cur = statusStore.get(providerJobId);
    if (!cur) return;
    statusStore.set(providerJobId, { ...cur, ...patch });
  }
}

export function getRenderProvider(id: RenderProviderId): RenderProvider {
  if (id === 'LOCAL_BLENDER') return new LocalBlenderProvider();
  if (id === 'RUNPOD_BLENDER') return new RunpodBlenderProvider();
  throw new AppError(`Unknown render provider: ${id}`, 'UNKNOWN_RENDER_PROVIDER', 400);
}

export const localBlenderProvider = new LocalBlenderProvider();
export const runpodBlenderProvider = new RunpodBlenderProvider();

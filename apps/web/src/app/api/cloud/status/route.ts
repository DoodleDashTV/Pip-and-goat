import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';
import {
  CloudRenderStageSchema,
  localBlenderProvider,
  runpodBlenderProvider,
  resolveCloudCostLimitsFromEnv,
} from '@doodle-dash/production';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  jobId: z.string().uuid().optional(),
  providerJobId: z.string().optional(),
  provider: z.enum(['LOCAL_BLENDER', 'RUNPOD_BLENDER']).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    jobId: url.searchParams.get('jobId') ?? undefined,
    providerJobId: url.searchParams.get('providerJobId') ?? undefined,
    provider: url.searchParams.get('provider') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const limits = resolveCloudCostLimitsFromEnv();
  const [localHealth, runpodHealth] = await Promise.all([
    localBlenderProvider.healthCheck(),
    runpodBlenderProvider.healthCheck(),
  ]);

  let jobView = null;
  if (parsed.data.jobId) {
    const job = await prisma.renderJob.findUnique({ where: { id: parsed.data.jobId } });
    if (job) {
      const meta = (job.payload as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
      const stageRaw = typeof meta.cloudStage === 'string' ? meta.cloudStage : job.status;
      const stage = CloudRenderStageSchema.safeParse(stageRaw);
      jobView = {
        jobId: job.id,
        stage: stage.success ? stage.data : mapDbStatus(job.status),
        progress: job.progress,
        estimatedCostUsd: typeof meta.estimatedCostUsd === 'number' ? meta.estimatedCostUsd : null,
        actualCostUsd: typeof meta.actualCostUsd === 'number' ? meta.actualCostUsd : null,
        gpuType: typeof meta.gpuType === 'string' ? meta.gpuType : null,
        elapsedSeconds: typeof meta.elapsedSeconds === 'number' ? meta.elapsedSeconds : null,
        estimatedRemainingSeconds:
          typeof meta.estimatedRemainingSeconds === 'number' ? meta.estimatedRemainingSeconds : null,
        outputLocation: typeof meta.outputLocation === 'string' ? meta.outputLocation : null,
        message: job.error ?? job.rationale,
        provider: meta.provider ?? null,
        status: job.status,
      };
    }
  }

  if (parsed.data.providerJobId) {
    const provider =
      parsed.data.provider === 'LOCAL_BLENDER' ? localBlenderProvider : runpodBlenderProvider;
    jobView = await provider.getRenderStatus(parsed.data.providerJobId);
  }

  return NextResponse.json({
    limits: {
      cloudRenderEnabled: limits.cloudRenderEnabled,
      maxGpuHourlyPrice: limits.maxGpuHourlyPrice,
      maxSingleJobCost: limits.maxSingleJobCost,
      maxDailyGpuCost: limits.maxDailyGpuCost,
      maxMonthlyGpuCost: limits.maxMonthlyGpuCost,
      idleShutdownMinutes: limits.idleShutdownMinutes,
      maxJobRuntimeMinutes: limits.maxJobRuntimeMinutes,
      allowPaidGpuLaunch: limits.allowPaidGpuLaunch,
    },
    providers: {
      LOCAL_BLENDER: localHealth,
      RUNPOD_BLENDER: runpodHealth,
    },
    job: jobView,
    paidGpuCreated: 'NO',
    gpuBillingStarted: 'NO',
  });
}

function mapDbStatus(status: string) {
  switch (status) {
    case 'QUEUED':
      return 'QUEUED';
    case 'PREPARING':
      return 'PREPARING_ASSETS';
    case 'RENDERING':
      return 'RENDERING';
    case 'ENCODING':
      return 'ENCODING';
    case 'QUALITY_CHECK':
      return 'QC';
    case 'COMPLETE':
      return 'COMPLETE';
    case 'FAILED':
    case 'CANCELLED':
      return 'FAILED';
    default:
      return 'QUEUED';
  }
}

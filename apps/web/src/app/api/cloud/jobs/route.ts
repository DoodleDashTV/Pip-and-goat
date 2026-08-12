import { NextResponse } from 'next/server';
import {
  batchProductionOrchestrator,
  buildCloudJobManifest,
  chooseRenderProvider,
  estimateCloudRenderCost,
  CloudCostGuardrails,
  resolveCloudCostLimitsFromEnv,
  getRenderProvider,
  seasonProductionQueue,
} from '@doodle-dash/production';
import { z } from 'zod';

const BodySchema = z.object({
  action: z.enum(['route', 'estimate', 'submit', 'batch_plan', 'season_upsert']),
  profile: z.enum(['AUDIT_FAST', 'DRAFT_FAST', 'DRAFT_HD', 'FINAL_1080P', 'PREMIUM']).optional(),
  jobId: z.string().optional(),
  episodeId: z.string().optional(),
  seasonId: z.string().optional(),
  episodeNumber: z.number().int().positive().optional(),
  episodeIds: z.array(z.string()).optional(),
  frameCount: z.number().int().nonnegative().optional(),
  resolution: z.string().optional(),
  fps: z.number().int().positive().optional(),
  gpuHourlyPriceUsd: z.number().positive().optional(),
  explicitProvider: z.enum(['LOCAL_BLENDER', 'RUNPOD_BLENDER']).optional(),
  draftApproved: z.boolean().optional(),
  finalApproved: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

export async function POST(request: Request) {
  const body = BodySchema.parse(await request.json());
  const limits = resolveCloudCostLimitsFromEnv();

  if (body.action === 'route') {
    const decision = await chooseRenderProvider({
      profile: body.profile ?? 'DRAFT_FAST',
      explicitProvider: body.explicitProvider,
    });
    return NextResponse.json({ decision, limits });
  }

  if (body.action === 'estimate') {
    const estimate = estimateCloudRenderCost({
      frameCount: body.frameCount ?? 1800,
      resolution: body.resolution ?? '1080x1920',
      profile: body.profile ?? 'FINAL_1080P',
      gpuType: 'NVIDIA GeForce RTX 4090',
      gpuHourlyPriceUsd: body.gpuHourlyPriceUsd ?? 0.34,
    });
    const decision = new CloudCostGuardrails(limits).evaluate({
      estimate,
      paidGpuApproved: limits.allowPaidGpuLaunch,
    });
    return NextResponse.json({ estimate, decision, limits });
  }

  if (body.action === 'submit') {
    if (!body.jobId || !body.episodeId) {
      return NextResponse.json({ error: 'jobId and episodeId required' }, { status: 400 });
    }
    const route = await chooseRenderProvider({
      profile: body.profile ?? 'FINAL_1080P',
      explicitProvider: body.explicitProvider,
    });
    const manifest = buildCloudJobManifest({
      jobId: body.jobId,
      episodeId: body.episodeId,
      seasonId: body.seasonId,
      episodeNumber: body.episodeNumber,
      renderMode: body.profile ?? 'FINAL_1080P',
      resolution: body.resolution ?? '1080x1920',
      fps: body.fps ?? 30,
      estimatedFrameCount: body.frameCount ?? 1800,
    });
    const provider = getRenderProvider(route.provider);
    const result = await provider.submitRenderJob(manifest);
    return NextResponse.json({ route, manifest, result });
  }

  if (body.action === 'batch_plan') {
    const session = batchProductionOrchestrator.createSession({
      episodeIds: body.episodeIds ?? [],
      seasonId: body.seasonId,
      provider: 'RUNPOD_BLENDER',
    });
    return NextResponse.json({
      session,
      plan: batchProductionOrchestrator.plan(session),
      note: 'One GPU for the batch — no terminate between episodes unless necessary.',
    });
  }

  if (body.action === 'season_upsert') {
    if (!body.seasonId || !body.episodeId || !body.episodeNumber) {
      return NextResponse.json({ error: 'seasonId, episodeId, episodeNumber required' }, { status: 400 });
    }
    const entry = seasonProductionQueue.upsert({
      seasonId: body.seasonId,
      episodeId: body.episodeId,
      episodeNumber: body.episodeNumber,
      priority: body.priority ?? 50,
      draftApproved: body.draftApproved ?? false,
      finalApproved: body.finalApproved ?? false,
      renderStatus: 'PENDING',
      qcStatus: 'PENDING',
      cloudCost: null,
      finalOutput: null,
    });
    return NextResponse.json({ entry, season: seasonProductionQueue.list(body.seasonId) });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

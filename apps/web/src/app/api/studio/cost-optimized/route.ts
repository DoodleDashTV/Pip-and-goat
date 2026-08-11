import { NextResponse } from 'next/server';
import {
  blenderFirstRouter,
  costGuardian,
  renderEstimator,
  shotRenderCacheService,
} from '@doodle-dash/production';
import { z } from 'zod';

const EstimateSchema = z.object({
  episodeId: z.string().uuid(),
  profileCode: z.enum(['DRAFT_FAST', 'DRAFT_HD', 'FINAL_1080P', 'PREMIUM']).default('FINAL_1080P'),
});

const CacheSchema = z.object({
  shotId: z.string().uuid(),
  profileCode: z.string().min(1),
  engine: z.string().default('EEVEE'),
});

const PaidSchema = z.object({
  episodeId: z.string().uuid().optional(),
  shotId: z.string().uuid().optional(),
  provider: z.string().min(1),
  model: z.string().optional(),
  estimatedCost: z.number().nonnegative(),
  reason: z.string().min(1),
});

const DecideSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(['APPROVE', 'CANCEL', 'USE_BLENDER_INSTEAD']),
  by: z.string().min(1).default('studio-user'),
});

export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'estimate';
  const json = await request.json();

  if (action === 'estimate') {
    const body = EstimateSchema.parse(json);
    const estimate = await renderEstimator.estimateEpisode(body.episodeId, body.profileCode);
    return NextResponse.json({ estimate });
  }
  if (action === 'cache-lookup') {
    const body = CacheSchema.parse(json);
    const result = await shotRenderCacheService.lookupOrMark(body);
    return NextResponse.json(result);
  }
  if (action === 'route') {
    const route = await blenderFirstRouter.routeRender(json);
    return NextResponse.json({ route });
  }
  if (action === 'paid-request') {
    const body = PaidSchema.parse(json);
    const result = await costGuardian.requestPaidGeneration(body);
    return NextResponse.json(result);
  }
  if (action === 'paid-decide') {
    const body = DecideSchema.parse(json);
    const result = await costGuardian.decide(body);
    return NextResponse.json({ approval: result });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

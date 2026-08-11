import { NextResponse } from 'next/server';
import {
  shotPackageService,
  publishingPackageService,
  pacingToolsService,
  shortsProfileService,
  observabilityService,
} from '@doodle-dash/production';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('shot-package'), shotId: z.string().uuid() }),
  z.object({ action: z.literal('publishing-package'), episodeId: z.string().uuid() }),
  z.object({ action: z.literal('pacing'), episodeId: z.string().uuid() }),
  z.object({ action: z.literal('ensure-shorts-profile') }),
  z.object({
    action: z.literal('observe'),
    jobId: z.string(),
    jobType: z.string(),
    episodeId: z.string().uuid().optional(),
    sceneId: z.string().uuid().optional(),
    shotId: z.string().uuid().optional(),
    warnings: z.unknown().optional(),
    errors: z.unknown().optional(),
  }),
]);

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    switch (body.action) {
      case 'shot-package':
        return NextResponse.json({ package: await shotPackageService.buildForShot(body.shotId) });
      case 'publishing-package':
        return NextResponse.json(await publishingPackageService.buildForEpisode(body.episodeId));
      case 'pacing':
        return NextResponse.json({ report: await pacingToolsService.analyzeEpisode(body.episodeId) });
      case 'ensure-shorts-profile':
        return NextResponse.json({ profile: await shortsProfileService.ensureDefault() });
      case 'observe':
        return NextResponse.json({ observation: await observabilityService.record(body) });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    throw error;
  }
}

export async function GET() {
  const profile = await shortsProfileService.ensureDefault();
  return NextResponse.json({ profile });
}

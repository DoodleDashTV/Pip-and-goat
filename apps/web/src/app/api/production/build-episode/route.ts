import { NextResponse } from 'next/server';
import { buildEpisodeOrchestrator } from '@doodle-dash/production';
import { AppError } from '@doodle-dash/shared';
import { prisma } from '@doodle-dash/database';
import { z } from 'zod';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const episodeId = searchParams.get('episodeId');
  const runs = await prisma.episodePipelineRun.findMany({
    where: episodeId ? { episodeId } : undefined,
    include: { stages: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({ runs });
}

const BodySchema = z.object({
  episodeId: z.string().uuid(),
  durationTargetSec: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]).optional(),
  resumeRunId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    if (body.resumeRunId) {
      const run = await buildEpisodeOrchestrator.resume(body.resumeRunId);
      return NextResponse.json({ run });
    }
    const run = await buildEpisodeOrchestrator.start({
      episodeId: body.episodeId,
      durationTargetSec: body.durationTargetSec ?? 30,
    });
    return NextResponse.json({ run });
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

import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';
import { renderJobService } from '@doodle-dash/rendering';
import { shotRenderCacheService } from '@doodle-dash/production';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json();
  const job = await prisma.renderJob.update({
    where: { id },
    data: {
      status: 'FAILED',
      error: body.message ?? body.error ?? 'Render failed',
      completedAt: new Date(),
    },
  });

  // Never leave an interrupted/failed attempt marked approved.
  try {
    const payload = (job.payload || {}) as {
      shotId?: string;
      metadata?: { profileCode?: string };
    };
    await shotRenderCacheService.rejectForJob({
      shotId: job.shotId || payload.shotId,
      profileCode: payload.metadata?.profileCode,
      engine: job.engine || 'EEVEE',
    });
  } catch {
    /* cache hygiene must not block fail reporting */
  }

  if (body.workerId) {
    try {
      await renderJobService.heartbeat(body.workerId, 'IDLE');
    } catch {
      // Worker row may be gone after crash/restart — failure still recorded.
    }
  }
  return NextResponse.json({ job });
}

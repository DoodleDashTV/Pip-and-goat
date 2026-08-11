import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';
import { renderJobService } from '@doodle-dash/rendering';

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
  if (body.workerId) {
    try {
      await renderJobService.heartbeat(body.workerId, 'IDLE');
    } catch {
      // Worker row may be gone after crash/restart — failure still recorded.
    }
  }
  return NextResponse.json({ job });
}

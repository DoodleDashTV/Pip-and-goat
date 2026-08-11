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
  for (const output of body.outputs ?? []) {
    await prisma.renderOutput.create({
      data: {
        renderJobId: id,
        kind: output.kind ?? 'preview',
        uri: output.uri,
        resolution: output.resolution ?? null,
        checksum: output.checksum ?? null,
        metadata: output.metadata ?? undefined,
      },
    });
  }
  const job = await prisma.renderJob.update({
    where: { id },
    data: {
      status: 'COMPLETE',
      progress: 100,
      completedAt: new Date(),
    },
  });

  // Content-addressed shot cache: approve fingerprint when final/draft output exists
  try {
    const payload = (job.payload || {}) as {
      shotId?: string;
      metadata?: { profileCode?: string; cacheFingerprint?: string };
    };
    const shotId = job.shotId || payload.shotId;
    const profileCode = payload.metadata?.profileCode;
    const mp4 = (body.outputs ?? []).find(
      (o: { kind?: string; uri?: string }) => o.kind === 'final' || String(o.uri || '').endsWith('.mp4'),
    );
    if (shotId && profileCode && mp4?.uri) {
      const lookup = await shotRenderCacheService.lookupOrMark({
        shotId,
        profileCode,
        engine: job.engine || 'EEVEE',
      });
      if (lookup.entry) {
        await shotRenderCacheService.markApproved(lookup.entry.id, mp4.uri, id);
      }
    }
  } catch {
    // Cache write must not fail the render completion.
  }

  if (body.workerId) {
    try {
      await renderJobService.heartbeat(body.workerId, 'IDLE');
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json({ job });
}

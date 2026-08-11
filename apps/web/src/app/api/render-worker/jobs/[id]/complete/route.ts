import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';
import { renderJobService } from '@doodle-dash/rendering';

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
  if (body.workerId) {
    await renderJobService.heartbeat(body.workerId, 'IDLE');
  }
  return NextResponse.json({ job });
}

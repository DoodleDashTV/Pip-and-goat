import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json();
  const job = await prisma.renderJob.update({
    where: { id },
    data: {
      status: body.status ?? undefined,
      progress: typeof body.progress === 'number' ? body.progress : undefined,
      error: body.message ?? undefined,
    },
  });
  return NextResponse.json({ job });
}

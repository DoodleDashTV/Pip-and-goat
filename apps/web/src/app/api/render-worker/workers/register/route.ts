import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';
import { renderJobService } from '@doodle-dash/rendering';

export async function POST(request: Request) {
  const body = await request.json();
  const worker = await renderJobService.registerWorker({
    id: body.id,
    name: body.name ?? body.id,
    capabilities: body.capabilities ?? {},
    status: 'IDLE',
  });
  return NextResponse.json({ worker });
}

export async function GET() {
  const workers = await prisma.renderWorker.findMany({ orderBy: { updatedAt: 'desc' } });
  return NextResponse.json({ workers });
}

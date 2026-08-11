import { NextResponse } from 'next/server';
import { renderJobService } from '@doodle-dash/rendering';

export async function POST(request: Request) {
  const body = await request.json();
  if (body.workerId) {
    await renderJobService.heartbeat(body.workerId, 'IDLE');
  }
  const job = await renderJobService.claimNext(body.workerId);
  return NextResponse.json({ job: job ?? null });
}

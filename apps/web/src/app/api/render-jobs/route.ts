import { NextResponse } from 'next/server';
import { renderJobService, CreateRenderJobSchema } from '@doodle-dash/rendering';
export async function GET() {
  const jobs = await renderJobService.list({ take: 50 });
  return NextResponse.json({ jobs });
}
export async function POST(request: Request) {
  const body = CreateRenderJobSchema.parse(await request.json());
  const job = await renderJobService.create(body);
  return NextResponse.json({ job }, { status: 201 });
}

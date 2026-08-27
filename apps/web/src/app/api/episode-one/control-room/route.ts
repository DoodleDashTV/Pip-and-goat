import { NextResponse } from 'next/server';
import { compileEp001AutonomousControlRoom } from '@/lib/tivvlejoy-ep001-autonomous-control-room';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    persisted: false,
    authorityGranted: false,
    controlRoom: compileEp001AutonomousControlRoom(),
  });
}

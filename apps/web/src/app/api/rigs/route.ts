import { NextResponse } from 'next/server';
import { facialRigService, rigService } from '@doodle-dash/characters';

export async function GET() {
  const [rigs, facialRigs] = await Promise.all([
    rigService.listAll(),
    facialRigService.listAll(),
  ]);
  return NextResponse.json({ rigs, facialRigs });
}

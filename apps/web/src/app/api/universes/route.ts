import { NextResponse } from 'next/server';
import { universeService } from '@doodle-dash/universe';

export async function GET() {
  const universes = await universeService.listUniverses();
  return NextResponse.json({ universes });
}

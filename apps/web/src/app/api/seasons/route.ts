import { NextResponse } from 'next/server';
import { seasonService } from '@doodle-dash/story';
import { universeService } from '@doodle-dash/universe';

export async function GET() {
  const universe = await universeService.getPrimaryUniverse();
  if (!universe) return NextResponse.json({ seasons: [] });
  const seasons = await seasonService.list(universe.id);
  return NextResponse.json({ seasons });
}

import { NextResponse } from 'next/server';
import { poseLibraryService } from '@doodle-dash/characters';
import { universeService } from '@doodle-dash/universe';

export async function GET() {
  const universe = await universeService.getPrimaryUniverse();
  if (!universe) return NextResponse.json({ poses: [] });
  const poses = await poseLibraryService.list(universe.id);
  return NextResponse.json({ poses });
}

import { NextResponse } from 'next/server';
import { animationLibraryService } from '@doodle-dash/characters';
import { universeService } from '@doodle-dash/universe';

export async function GET() {
  const universe = await universeService.getPrimaryUniverse();
  if (!universe) return NextResponse.json({ animations: [] });
  const animations = await animationLibraryService.list(universe.id);
  return NextResponse.json({ animations });
}

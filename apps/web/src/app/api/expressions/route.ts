import { NextResponse } from 'next/server';
import { expressionLibraryService, visemeLibraryService } from '@doodle-dash/characters';
import { universeService } from '@doodle-dash/universe';

export async function GET() {
  const universe = await universeService.getPrimaryUniverse();
  const [expressions, visemes] = await Promise.all([
    universe ? expressionLibraryService.list(universe.id) : Promise.resolve([]),
    visemeLibraryService.list(),
  ]);
  return NextResponse.json({ expressions, visemes });
}

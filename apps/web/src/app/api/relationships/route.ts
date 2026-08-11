import { NextResponse } from 'next/server';
import { relationshipService } from '@doodle-dash/characters';
import { universeService } from '@doodle-dash/universe';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const characterId = searchParams.get('characterId');
  if (characterId) {
    const relationships = await relationshipService.listForCharacter(characterId);
    return NextResponse.json({ relationships });
  }

  const universe = await universeService.getPrimaryUniverse();
  if (!universe) return NextResponse.json({ relationships: [] });
  const relationships = await relationshipService.listByUniverse(universe.id);
  return NextResponse.json({ relationships });
}

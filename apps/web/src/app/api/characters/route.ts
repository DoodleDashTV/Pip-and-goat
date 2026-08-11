import { NextResponse } from 'next/server';
import { characterService } from '@doodle-dash/characters';
import { universeService } from '@doodle-dash/universe';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const founding = searchParams.get('founding') === 'true';

  if (founding) {
    const characters = await characterService.getFoundingCharacters();
    return NextResponse.json({ characters });
  }

  const universe = await universeService.getPrimaryUniverse();
  if (!universe) {
    return NextResponse.json({ characters: [] });
  }

  const characters = await characterService.listByUniverse(universe.id);
  return NextResponse.json({ characters });
}

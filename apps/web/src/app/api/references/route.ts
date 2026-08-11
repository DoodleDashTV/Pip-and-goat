import { NextResponse } from 'next/server';
import { referenceImageService } from '@doodle-dash/characters';
import { universeService } from '@doodle-dash/universe';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pending = searchParams.get('pending') === 'true';
  const characterId = searchParams.get('characterId');

  if (characterId) {
    const references = await referenceImageService.listByCharacter(characterId);
    return NextResponse.json({ references });
  }

  if (pending) {
    const universe = await universeService.getPrimaryUniverse();
    const references = await referenceImageService.listPendingReview(universe?.id);
    return NextResponse.json({ references });
  }

  const universe = await universeService.getPrimaryUniverse();
  const references = await referenceImageService.listPendingReview(universe?.id);
  return NextResponse.json({ references });
}

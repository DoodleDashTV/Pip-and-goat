import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';

export async function GET() {
  const [universe, characters, assetsMissing, canonLocked] = await Promise.all([
    prisma.universe.count({ where: { status: 'ACTIVE' } }),
    prisma.character.count({ where: { foundingCharacter: true } }),
    prisma.asset.count({ where: { missing: true } }),
    prisma.canonFact.count({ where: { locked: true } }),
  ]);

  return NextResponse.json({
    health: {
      activeUniverses: universe,
      foundingCharacters: characters,
      missingAssets: assetsMissing,
      lockedCanon: canonLocked,
      characterAssetIntegrity:
        assetsMissing === 0 ? 100 : Math.max(0, 100 - assetsMissing * 10),
      note: 'Full Universe Health arrives in a later milestone.',
    },
  });
}

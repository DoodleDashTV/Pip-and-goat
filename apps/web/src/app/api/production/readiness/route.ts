import { NextResponse } from 'next/server';
import { universeService } from '@doodle-dash/universe';
import { productionReadinessService } from '@doodle-dash/production';
import { prisma } from '@doodle-dash/database';

export async function GET() {
  const universe = await universeService.getPrimaryUniverse();
  if (!universe) {
    return NextResponse.json({ rows: [], universeId: null });
  }
  const rows = await productionReadinessService.snapshotUniverse(universe.id);
  const snapshots = await prisma.productionReadinessSnapshot.findMany({
    where: { universeId: universe.id },
    orderBy: [{ area: 'asc' }, { entityKey: 'asc' }],
  });
  return NextResponse.json({ universeId: universe.id, rows, snapshots });
}

export async function POST() {
  const universe = await universeService.getPrimaryUniverse();
  if (!universe) {
    return NextResponse.json({ error: 'No universe' }, { status: 404 });
  }
  const rows = await productionReadinessService.snapshotUniverse(universe.id);
  return NextResponse.json({ universeId: universe.id, rows });
}

import { NextResponse } from 'next/server';
import { backupExportService } from '@doodle-dash/production';
import { universeService } from '@doodle-dash/universe';

export async function GET() {
  const universe = await universeService.getPrimaryUniverse();
  if (!universe) {
    return NextResponse.json({ error: { message: 'No universe' } }, { status: 404 });
  }
  const payload = await backupExportService.exportUniverseSnapshot(universe.id);
  return NextResponse.json({ backup: payload });
}

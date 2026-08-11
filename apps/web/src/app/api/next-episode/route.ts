import { NextResponse } from 'next/server';
import { nextEpisodeOrchestrator } from '@doodle-dash/story';
import { universeService } from '@doodle-dash/universe';
export async function POST() {
  const universe = await universeService.getPrimaryUniverse();
  if (!universe) {
    return NextResponse.json({ error: { message: 'No universe' } }, { status: 404 });
  }
  const proposal = await nextEpisodeOrchestrator.createNextEpisodeProposal({ universeId: universe.id });
  return NextResponse.json({ proposal });
}

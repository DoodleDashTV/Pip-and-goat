import { NextResponse } from 'next/server';
import { episodeService } from '@doodle-dash/story';
import { universeService } from '@doodle-dash/universe';
export async function GET() {
  const universe = await universeService.getPrimaryUniverse();
  if (!universe) return NextResponse.json({ episodes: [] });
  const episodes = await episodeService.list({ universeId: universe.id });
  return NextResponse.json({ episodes });
}

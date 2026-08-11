import { NextResponse } from 'next/server';
import { searchService } from '@doodle-dash/production';
import { universeService } from '@doodle-dash/universe';
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  const universe = await universeService.getPrimaryUniverse();
  if (!universe || !q) return NextResponse.json({ results: [] });
  const results = await searchService.search({ universeId: universe.id, query: q });
  return NextResponse.json({ results });
}

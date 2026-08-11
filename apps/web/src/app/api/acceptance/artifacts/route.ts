import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function artifactsRoot() {
  // Prefer repo-root artifacts/ regardless of Next cwd (apps/web vs /agent).
  const candidates = [
    path.resolve(process.cwd(), 'artifacts/acceptance'),
    path.resolve(process.cwd(), '../../artifacts/acceptance'),
    path.resolve(process.cwd(), '../artifacts/acceptance'),
    '/agent/artifacts/acceptance',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

function contentTypeFor(file: string) {
  if (file.endsWith('.mp4')) return 'video/mp4';
  if (file.endsWith('.srt')) return 'application/x-subrip';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

/**
 * Serve acceptance-test artifacts only.
 * Query: ?testId=ACCEPT-...&file=exports/FINAL_1080P.mp4
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const testId = url.searchParams.get('testId');
    const file = url.searchParams.get('file');
    if (!testId || !file) {
      return NextResponse.json({ error: 'testId and file are required' }, { status: 400 });
    }
    if (!/^ACCEPT-[A-Za-z0-9._-]+$/.test(testId)) {
      return NextResponse.json({ error: 'Invalid testId' }, { status: 400 });
    }
    if (file.includes('..') || path.isAbsolute(file)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    const root = path.resolve(artifactsRoot(), testId);
    const target = path.resolve(root, file);
    if (!target.startsWith(root + path.sep)) {
      return NextResponse.json({ error: 'Path escapes artifact root' }, { status: 400 });
    }
    if (!existsSync(target)) {
      return NextResponse.json(
        { error: 'Artifact not found', testId, file, root: artifactsRoot() },
        { status: 404 },
      );
    }

    const stat = statSync(target);
    const bytes = readFileSync(target);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentTypeFor(file),
        'Content-Length': String(stat.size),
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': `inline; filename="${path.basename(file)}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to serve artifact', detail: String(error) },
      { status: 500 },
    );
  }
}

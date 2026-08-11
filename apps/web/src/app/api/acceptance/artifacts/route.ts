import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ARTIFACTS_ROOT = path.resolve(process.cwd(), '../../artifacts/acceptance');

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

  const root = path.resolve(ARTIFACTS_ROOT, testId);
  const target = path.resolve(root, file);
  if (!target.startsWith(root + path.sep)) {
    return NextResponse.json({ error: 'Path escapes artifact root' }, { status: 400 });
  }
  if (!existsSync(target)) {
    return NextResponse.json({ error: 'Artifact not found', testId, file }, { status: 404 });
  }

  const stat = statSync(target);
  const stream = createReadStream(target);
  return new NextResponse(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentTypeFor(file),
      'Content-Length': String(stat.size),
      'Cache-Control': 'private, max-age=60',
      'Content-Disposition': `inline; filename="${path.basename(file)}"`,
    },
  });
}

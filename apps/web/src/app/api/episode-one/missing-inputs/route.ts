import { NextResponse } from 'next/server';
import { compileEp001MissingInputManifest } from '@/lib/tivvlejoy-ep001-missing-input-manifest';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    persisted: false,
    authorityGranted: false,
    manifest: compileEp001MissingInputManifest(),
  });
}

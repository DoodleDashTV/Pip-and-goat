import { NextResponse } from 'next/server';
import { compileEp001ExternalHandoffPackage } from '@/lib/tivvlejoy-ep001-external-handoff-package';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    persisted: false,
    authorityGranted: false,
    package: compileEp001ExternalHandoffPackage(),
  });
}

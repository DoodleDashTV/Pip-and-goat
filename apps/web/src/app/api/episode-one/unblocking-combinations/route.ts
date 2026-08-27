import { NextResponse } from 'next/server';
import { compileEp001UnblockingCombinationAudit } from '@/lib/tivvlejoy-ep001-unblocking-combination-audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    persisted: false,
    authorityGranted: false,
    audit: compileEp001UnblockingCombinationAudit(),
  });
}

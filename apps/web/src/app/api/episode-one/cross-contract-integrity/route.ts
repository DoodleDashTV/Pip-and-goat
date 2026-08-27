import { NextResponse } from 'next/server';
import { compileEp001CrossContractIntegrityAudit } from '@/lib/tivvlejoy-ep001-cross-contract-integrity';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    persisted: false,
    authorityGranted: false,
    audit: compileEp001CrossContractIntegrityAudit(),
  });
}

import { NextResponse } from 'next/server';
import {
  compileEp001ExternalArrivalReceipt,
  type ExternalArrivalCandidate,
} from '@/lib/tivvlejoy-ep001-external-arrival-receipt';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: ExternalArrivalCandidate;
  try {
    body = (await request.json()) as ExternalArrivalCandidate;
  } catch {
    return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('arrivalType' in body) || !('candidate' in body)) {
    return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'INVALID_ARRIVAL_RECEIPT_REQUEST' }, { status: 400 });
  }

  try {
    const receipt = compileEp001ExternalArrivalReceipt(body);
    return NextResponse.json({
      ok: true,
      persisted: false,
      authorityGranted: false,
      receipt,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      persisted: false,
      authorityGranted: false,
      error: error instanceof Error ? error.message : 'ARRIVAL_RECEIPT_COMPILATION_FAILED',
    }, { status: 400 });
  }
}

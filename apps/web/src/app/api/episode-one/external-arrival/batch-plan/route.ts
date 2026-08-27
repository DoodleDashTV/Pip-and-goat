import { NextResponse } from 'next/server';
import { compileEp001ExternalArrivalBatchPlan } from '@/lib/tivvlejoy-ep001-external-arrival-batch-plan';
import type { ExternalArrivalCandidate } from '@/lib/tivvlejoy-ep001-external-arrival-receipt';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const inputs = typeof body === 'object' && body !== null && Array.isArray((body as { inputs?: unknown }).inputs)
    ? (body as { inputs: ExternalArrivalCandidate[] }).inputs
    : null;
  if (!inputs) {
    return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'INVALID_BATCH_REQUEST' }, { status: 400 });
  }

  try {
    const batchPlan = compileEp001ExternalArrivalBatchPlan(inputs);
    return NextResponse.json({ ok: true, persisted: false, authorityGranted: false, batchPlan });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      persisted: false,
      authorityGranted: false,
      error: error instanceof Error ? error.message : 'BATCH_PLAN_COMPILATION_FAILED',
    }, { status: 400 });
  }
}

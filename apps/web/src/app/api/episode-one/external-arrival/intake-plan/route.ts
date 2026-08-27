import { NextResponse } from 'next/server';
import {
  compileEp001ExternalArrivalIntakePlan,
} from '@/lib/tivvlejoy-ep001-external-arrival-intake-plan';
import type { ExternalArrivalCandidate } from '@/lib/tivvlejoy-ep001-external-arrival-receipt';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: ExternalArrivalCandidate;
  try {
    body = (await request.json()) as ExternalArrivalCandidate;
  } catch {
    return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('arrivalType' in body) || !('candidate' in body)) {
    return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'INVALID_INTAKE_PLAN_REQUEST' }, { status: 400 });
  }

  try {
    const plan = compileEp001ExternalArrivalIntakePlan(body);
    return NextResponse.json({
      ok: true,
      persisted: false,
      authorityGranted: false,
      plan,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      persisted: false,
      authorityGranted: false,
      error: error instanceof Error ? error.message : 'INTAKE_PLAN_COMPILATION_FAILED',
    }, { status: 400 });
  }
}

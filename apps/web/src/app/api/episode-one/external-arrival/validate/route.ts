import { NextResponse } from 'next/server';
import {
  validatePaidAuthorizationArrival,
  validateRigArrival,
  validateSceneryLicenseArrival,
  type PaidAuthorizationCandidate,
  type RigArrivalCandidate,
  type SceneryLicenseCandidate,
} from '@/lib/tivvlejoy-ep001-external-arrival-validators';

export const dynamic = 'force-dynamic';

type ArrivalRequest =
  | { arrivalType: 'RIG'; candidate: RigArrivalCandidate }
  | { arrivalType: 'SCENERY_LICENSE'; candidate: SceneryLicenseCandidate }
  | { arrivalType: 'PAID_AUTHORIZATION'; candidate: PaidAuthorizationCandidate };

export async function POST(request: Request) {
  let body: ArrivalRequest;
  try {
    body = (await request.json()) as ArrivalRequest;
  } catch {
    return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('arrivalType' in body) || !('candidate' in body)) {
    return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'INVALID_ARRIVAL_REQUEST' }, { status: 400 });
  }

  try {
    const validation =
      body.arrivalType === 'RIG'
        ? validateRigArrival(body.candidate as RigArrivalCandidate)
        : body.arrivalType === 'SCENERY_LICENSE'
          ? validateSceneryLicenseArrival(body.candidate as SceneryLicenseCandidate)
          : body.arrivalType === 'PAID_AUTHORIZATION'
            ? validatePaidAuthorizationArrival(body.candidate as PaidAuthorizationCandidate)
            : null;

    if (!validation) {
      return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'UNKNOWN_ARRIVAL_TYPE' }, { status: 400 });
    }

    return NextResponse.json({
      ok: validation.valid,
      persisted: false,
      authorityGranted: false,
      validation,
    }, { status: validation.valid ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      persisted: false,
      authorityGranted: false,
      error: error instanceof Error ? error.message : 'ARRIVAL_VALIDATION_FAILED',
    }, { status: 400 });
  }
}

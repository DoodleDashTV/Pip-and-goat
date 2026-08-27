import { NextResponse } from 'next/server';
import { validateRigValidationResult, type RigValidationResultInput } from '@/lib/tivvlejoy-rig-validation-result-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as RigValidationResultInput;
    const result = validateRigValidationResult(body);
    return NextResponse.json(
      { schemaVersion: 'TIVVLEJOY_RIG_VALIDATION_RESULT_VALIDATION_V1', success: true, ...result },
      { status: result.structurallyValid ? 200 : 422, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } },
    );
  } catch {
    return NextResponse.json(
      { schemaVersion: 'TIVVLEJOY_RIG_VALIDATION_RESULT_VALIDATION_V1', success: false, structurallyValid: false, technicalSuiteComplete: false, errors: ['RIG_RESULT_INVALID_JSON'], humanApproved: false, episodeAdmitted: false, productionEnabled: false },
      { status: 400, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } },
    );
  }
}

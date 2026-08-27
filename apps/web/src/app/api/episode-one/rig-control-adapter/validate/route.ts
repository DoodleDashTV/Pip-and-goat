import { NextResponse } from 'next/server';
import { validateRigControlMapping, type RigControlMapping } from '@/lib/tivvlejoy-rig-control-adapter';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as RigControlMapping;
    const result = validateRigControlMapping(body);
    return NextResponse.json(
      { schemaVersion: 'TIVVLEJOY_RIG_CONTROL_ADAPTER_VALIDATION_V1', success: true, ...result },
      { status: result.valid ? 200 : 422, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } },
    );
  } catch {
    return NextResponse.json(
      {
        schemaVersion: 'TIVVLEJOY_RIG_CONTROL_ADAPTER_VALIDATION_V1', success: false, valid: false,
        errors: ['RIG_ADAPTER_INVALID_JSON'], technicalInspectionPassed: false, humanApproved: false, productionEnabled: false,
      },
      { status: 400, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } },
    );
  }
}

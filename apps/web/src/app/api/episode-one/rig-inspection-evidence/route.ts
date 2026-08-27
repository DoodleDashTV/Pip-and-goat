import { NextResponse } from 'next/server';
import {
  EP001_RIG_EVIDENCE_TOKEN_HEADER,
  handleEp001RigEvidenceIntake,
  publicRigEvidenceIntakeStatus,
} from '@/lib/tivvlejoy-ep001-rig-inspection-evidence-intake';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : 'RIG_EVIDENCE_REFUSED';
  const unauthorized = code === 'RIG_EVIDENCE_UNAUTHORIZED' || code === 'RIG_EVIDENCE_PREVIEW_REQUIRED';
  return NextResponse.json(
    {
      schemaVersion: 'TIVVLEJOY_EP001_RIG_EVIDENCE_INTAKE_V1',
      error: unauthorized ? 'Rig evidence authorization refused.' : 'Rig evidence request refused.',
      code,
      uploaded: false,
      approved: false,
      productionEnabled: false,
    },
    { status: unauthorized ? 401 : 400, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } },
  );
}

export async function GET() {
  return NextResponse.json(publicRigEvidenceIntakeStatus(process.env), {
    status: 200,
    headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export async function POST(request: Request) {
  const token = request.headers.get(EP001_RIG_EVIDENCE_TOKEN_HEADER) ?? '';
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '') as Parameters<typeof handleEp001RigEvidenceIntake>[0]['action'];
    const requestOrigin = request.headers.get('origin') ?? '';
    const requestHost = request.headers.get('host') ?? '';
    const trustedPreviewOrigin = requestOrigin === `https://${requestHost}` && requestHost.endsWith('.vercel.app') ? requestOrigin : '';
    const result = await handleEp001RigEvidenceIntake({
      action,
      body,
      token,
      env: { ...process.env, TIVVLEJOY_SCENERY_CORS_ORIGIN: trustedPreviewOrigin },
    });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  } catch (error) {
    return failure(error);
  }
}

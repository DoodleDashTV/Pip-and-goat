import { NextResponse } from 'next/server';
import { describeSceneryStorageConfiguration } from '@/lib/scenery/intake/config';
import {
  EP001_EVIDENCE_INTAKE_TOKEN_HEADER,
  handleEp001ExternalEvidenceIntake,
  publicExternalEvidenceIntakeStatus,
} from '@/lib/tivvlejoy-ep001-external-evidence-intake';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : 'EVIDENCE_INTAKE_REFUSED';
  const unauthorized = code === 'EVIDENCE_INTAKE_UNAUTHORIZED' || code === 'EVIDENCE_INTAKE_PREVIEW_REQUIRED';
  return NextResponse.json({ error: unauthorized ? 'Evidence intake authorization refused.' : 'Evidence intake request refused.', code, admitted: false, productionEnabled: false }, { status: unauthorized ? 401 : 400 });
}

export async function GET() {
  const status = publicExternalEvidenceIntakeStatus(process.env);
  const storage = describeSceneryStorageConfiguration(process.env);
  return NextResponse.json({
    ...status,
    privateStorageConfigured: storage.configured,
    privateStorageDurable: storage.durable,
    readyForPrivateEvidenceUpload: status.previewRuntime && status.tokenConfigured && storage.configured && storage.durable,
    providerCalls: 0,
    storageMutations: 0,
    paidRequests: 0,
  }, { status: 200, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
}

export async function POST(request: Request) {
  const token = request.headers.get(EP001_EVIDENCE_INTAKE_TOKEN_HEADER) ?? '';
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '') as Parameters<typeof handleEp001ExternalEvidenceIntake>[0]['action'];
    const requestOrigin = request.headers.get('origin') ?? '';
    const requestHost = request.headers.get('host') ?? '';
    const trustedPreviewOrigin = requestOrigin === `https://${requestHost}` && requestHost.endsWith('.vercel.app') ? requestOrigin : '';
    const result = await handleEp001ExternalEvidenceIntake({ action, body, token, env: { ...process.env, TIVVLEJOY_SCENERY_CORS_ORIGIN: trustedPreviewOrigin } });
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
  } catch (error) {
    return failure(error);
  }
}

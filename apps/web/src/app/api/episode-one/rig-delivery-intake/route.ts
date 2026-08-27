import { NextResponse } from 'next/server';
import {
  EP001_RIG_INTAKE_TOKEN_HEADER,
  handleEp001RigDeliveryIntake,
  publicRigIntakeStatus,
} from '@/lib/tivvlejoy-ep001-rig-delivery-intake';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function publicFailure(error: unknown) {
  const code = error instanceof Error ? error.message : 'RIG_INTAKE_REFUSED';
  const unauthorized = code === 'RIG_INTAKE_UNAUTHORIZED' || code === 'RIG_INTAKE_PREVIEW_REQUIRED';
  return NextResponse.json(
    {
      schemaVersion: 'TIVVLEJOY_EP001_RIG_DELIVERY_INTAKE_V1',
      error: unauthorized ? 'Rig intake authorization refused.' : 'Rig intake request refused.',
      code,
      uploaded: false,
      approved: false,
      productionEnabled: false,
    },
    { status: unauthorized ? 401 : 400, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } },
  );
}

export async function GET() {
  return NextResponse.json(publicRigIntakeStatus(process.env), {
    status: 200,
    headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export async function POST(request: Request) {
  const token = request.headers.get(EP001_RIG_INTAKE_TOKEN_HEADER) ?? '';
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '') as Parameters<typeof handleEp001RigDeliveryIntake>[0]['action'];
    const requestOrigin = request.headers.get('origin') ?? '';
    const requestHost = request.headers.get('host') ?? '';
    const trustedPreviewOrigin =
      requestOrigin === `https://${requestHost}` && requestHost.endsWith('.vercel.app')
        ? requestOrigin
        : '';
    const result = await handleEp001RigDeliveryIntake({
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
    return publicFailure(error);
  }
}

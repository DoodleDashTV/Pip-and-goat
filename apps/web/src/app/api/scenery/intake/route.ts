import { NextResponse } from 'next/server';
import { isPublicWebsitePreview } from '@/lib/public-preview';
import { handleSceneryIntakeAction, publicIntakeSnapshot } from '@/lib/scenery/intake';
import {
  publicAuthorizationFailure,
  redactSecretsFromText,
  SCENERY_INTAKE_TOKEN_HEADER,
} from '@/lib/scenery/intake/access';
import { SCENERY_INTAKE_LIMITS } from '@/lib/scenery/intake/limits';
import { getSceneryIntakeStore } from '@/lib/scenery/intake/store';
import { SceneryError } from '@/lib/scenery/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fail(error: unknown, token = '') {
  if (error instanceof SceneryError) {
    if (error.code === 'INTAKE_UNAUTHORIZED' || error.code === 'PRODUCTION_INTAKE_REFUSED') {
      return NextResponse.json(publicAuthorizationFailure(error.code), { status: 401 });
    }
    if (error.code === 'TOKEN_LOCATION_REFUSED') {
      return NextResponse.json(publicAuthorizationFailure(error.code), { status: 400 });
    }
    const status =
      error.code === 'REQUEST_TOO_LARGE' ? 413 : error.code === 'INTAKE_RATE_LIMIT' ? 429 : 400;
    return NextResponse.json(
      {
        error: redactSecretsFromText(error.message, [token]),
        code: error.code,
        uploaded: false,
        approved: false,
      },
      { status },
    );
  }
  return NextResponse.json(
    { error: 'Scenery intake request refused.', uploaded: false, approved: false },
    { status: 400 },
  );
}

export async function GET() {
  const status = await handleSceneryIntakeAction({
    action: 'status',
    body: {},
    publicPreview: isPublicWebsitePreview(),
  });
  const manifests = Array.isArray(status.manifests)
    ? (status.manifests as Array<Record<string, unknown>>)
    : [];
  return NextResponse.json({
    ...publicIntakeSnapshot(getSceneryIntakeStore().listManifests()),
    inventoryAudit: manifests.map((manifest) => ({
      sourceId: String(manifest.sourceId ?? ''),
      originalFilename: String(manifest.originalFilename ?? ''),
      uploadState: String(manifest.uploadState ?? ''),
      verificationState: String(manifest.verificationState ?? ''),
      quarantineState: String(manifest.quarantineState ?? ''),
    })),
    authorization: status.authorization,
    bytesPath: status.bytesPath,
    purchasedSourceObjectCount: status.purchasedSourceObjectCount,
    uploaded: false,
    approved: false,
  });
}

export async function POST(request: Request) {
  const token = request.headers.get(SCENERY_INTAKE_TOKEN_HEADER) ?? '';
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > SCENERY_INTAKE_LIMITS.maxJsonBodyBytes) {
      throw new SceneryError(
        'Intake request is larger than the Preview JSON limit.',
        'REQUEST_TOO_LARGE',
      );
    }
    const raw = await request.text();
    if (raw.length > SCENERY_INTAKE_LIMITS.maxJsonBodyBytes) {
      throw new SceneryError(
        'Intake request is larger than the Preview JSON limit.',
        'REQUEST_TOO_LARGE',
      );
    }
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const requestOrigin = request.headers.get('origin') ?? '';
    const requestHost = request.headers.get('host') ?? '';
    const trustedPreviewOrigin =
      requestOrigin === `https://${requestHost}` && requestHost.endsWith('.vercel.app')
        ? requestOrigin
        : '';
    const action = String(body.action ?? 'status') as Parameters<
      typeof handleSceneryIntakeAction
    >[0]['action'];
    const result = await handleSceneryIntakeAction({
      action,
      body,
      env: {
        ...process.env,
        TIVVLEJOY_SCENERY_CORS_ORIGIN: trustedPreviewOrigin,
      },
      publicPreview: isPublicWebsitePreview(),
      clientKey: request.headers.get('x-forwarded-for') ?? 'studio',
      studioToken: token,
    });
    const payload = { ...result, approved: false, uploaded: action === 'complete' };
    return NextResponse.json(
      JSON.parse(redactSecretsFromText(JSON.stringify(payload), [token])) as Record<
        string,
        unknown
      >,
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fail(new SceneryError('Intake request JSON is invalid.', 'INVALID_JSON'), token);
    }
    return fail(error, token);
  }
}

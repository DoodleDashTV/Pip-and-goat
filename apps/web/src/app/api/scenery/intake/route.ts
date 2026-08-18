import { NextResponse } from 'next/server';
import { isPublicWebsitePreview } from '@/lib/public-preview';
import { handleSceneryIntakeAction, publicIntakeSnapshot } from '@/lib/scenery/intake';
import { SCENERY_INTAKE_TOKEN_HEADER } from '@/lib/scenery/intake/access';
import { getSceneryIntakeStore } from '@/lib/scenery/intake/store';
import { SceneryError } from '@/lib/scenery/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fail(error: unknown) {
  if (error instanceof SceneryError) {
    const status = error.code === 'INTAKE_UNAUTHORIZED' || error.code === 'PRODUCTION_INTAKE_REFUSED' ? 401 : 400;
    return NextResponse.json({ error: error.message, code: error.code, uploaded: false }, { status });
  }
  return NextResponse.json({ error: 'Scenery intake request refused.', uploaded: false }, { status: 400 });
}

export async function GET() {
  const status = await handleSceneryIntakeAction({
    action: 'status',
    body: {},
    publicPreview: isPublicWebsitePreview(),
  });
  return NextResponse.json({
    ...publicIntakeSnapshot(getSceneryIntakeStore().listManifests()),
    authorization: status.authorization,
    bytesPath: status.bytesPath,
    purchasedSourceObjectCount: status.purchasedSourceObjectCount,
    uploaded: false,
    approved: false,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? 'status') as Parameters<typeof handleSceneryIntakeAction>[0]['action'];
    const result = await handleSceneryIntakeAction({
      action,
      body,
      publicPreview: isPublicWebsitePreview(),
      clientKey: request.headers.get('x-forwarded-for') ?? 'studio',
      studioToken: request.headers.get(SCENERY_INTAKE_TOKEN_HEADER) ?? '',
    });
    return NextResponse.json({ ...result, approved: false, uploaded: action === 'complete' });
  } catch (error) {
    return fail(error);
  }
}

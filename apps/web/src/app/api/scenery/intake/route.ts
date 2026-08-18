import { NextResponse } from 'next/server';
import { isPublicWebsitePreview } from '@/lib/public-preview';
import { handleSceneryIntakeAction, publicIntakeSnapshot } from '@/lib/scenery/intake';
import { getSceneryIntakeStore } from '@/lib/scenery/intake/store';
import { SceneryError } from '@/lib/scenery/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fail(error: unknown) {
  if (error instanceof SceneryError) {
    return NextResponse.json({ error: error.message, code: error.code, uploaded: false }, { status: 400 });
  }
  return NextResponse.json({ error: 'Scenery intake request refused.', uploaded: false }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    ...publicIntakeSnapshot(getSceneryIntakeStore().listManifests()),
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
    });
    return NextResponse.json({ ...result, approved: false, uploaded: action === 'complete' });
  } catch (error) {
    return fail(error);
  }
}

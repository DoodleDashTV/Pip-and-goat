import { NextResponse } from 'next/server';
import { isPublicWebsitePreview } from '@/lib/public-preview';
import { SCENERY_INTAKE_TOKEN_HEADER, publicAuthorizationFailure, redactSecretsFromText } from '@/lib/scenery/intake/access';
import { SCENERY_INTAKE_LIMITS } from '@/lib/scenery/intake/limits';
import { SceneryError } from '@/lib/scenery/types';
import {
  CharacterSourceError,
  handleCharacterSourceAction,
  type CharacterSourceAction,
} from '@/lib/tivvlejoy-character-source-intake';

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
    const status = error.code === 'REQUEST_TOO_LARGE' ? 413 : error.code === 'INTAKE_RATE_LIMIT' ? 429 : 400;
    return NextResponse.json(
      { error: redactSecretsFromText(error.message, [token]), code: error.code, uploaded: false },
      { status },
    );
  }
  if (error instanceof CharacterSourceError) {
    return NextResponse.json(
      { error: redactSecretsFromText(error.message, [token]), code: error.code, uploaded: false },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: 'Character source intake refused.', uploaded: false }, { status: 400 });
}

export async function GET() {
  const status = await handleCharacterSourceAction({
    action: 'status',
    body: {},
    publicPreview: isPublicWebsitePreview(),
  });
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const token = request.headers.get(SCENERY_INTAKE_TOKEN_HEADER) ?? '';
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > SCENERY_INTAKE_LIMITS.maxJsonBodyBytes) {
      throw new SceneryError('Intake request is larger than the Preview JSON limit.', 'REQUEST_TOO_LARGE');
    }
    const raw = await request.text();
    if (raw.length > SCENERY_INTAKE_LIMITS.maxJsonBodyBytes) {
      throw new SceneryError('Intake request is larger than the Preview JSON limit.', 'REQUEST_TOO_LARGE');
    }
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const action = String(body.action ?? 'status') as CharacterSourceAction;
    const result = await handleCharacterSourceAction({
      action,
      body,
      env: process.env,
      publicPreview: isPublicWebsitePreview(),
      clientKey: request.headers.get('x-forwarded-for') ?? 'studio',
      studioToken: token,
    });
    return NextResponse.json(JSON.parse(redactSecretsFromText(JSON.stringify(result), [token])) as Record<string, unknown>);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fail(new SceneryError('Intake request JSON is invalid.', 'INVALID_JSON'), token);
    }
    return fail(error, token);
  }
}

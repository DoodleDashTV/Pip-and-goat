import { NextResponse } from 'next/server';
import {
  assertIntakeRateLimit,
  assertNoClientStorageCredentials,
  assertNoTokenReflection,
  assertStudioIntakeAccess,
  assertTokenOnlyFromApprovedHeader,
  publicIntakeAuthorizationSnapshot,
  redactSecretsFromText,
  SCENERY_INTAKE_TOKEN_HEADER,
} from '@/lib/scenery/intake/access';
import { describeSceneryStorageConfiguration } from '@/lib/scenery/intake/config';
import { createConfiguredMultipartStorage } from '@/lib/scenery/intake/r2-multipart';
import { PURCHASED_TOOL_PACKAGES, PURCHASED_TOOL_UPLOAD_VERSION } from '@/lib/purchased-tools/catalog';
import {
  abortPurchasedToolSession,
  completePurchasedToolSession,
  createPurchasedToolSession,
  loadPurchasedToolSession,
  publicPurchasedToolSession,
  recordPurchasedToolHash,
  recordPurchasedToolPart,
  signPurchasedToolPart,
} from '@/lib/purchased-tools/intake-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function publicPackages() {
  return PURCHASED_TOOL_PACKAGES.map((item) => ({
    sourceId: item.sourceId,
    displayName: item.displayName,
    expectedFilename: item.expectedFilename,
    role: item.role,
    version: item.version,
    maxUploadBytes: item.maxUploadBytes,
    activation: item.activation,
  }));
}

function trustedEnv(request: Request): Record<string, string | undefined> {
  const origin = request.headers.get('origin') ?? '';
  const host = request.headers.get('host') ?? '';
  const trustedPreviewOrigin = origin === `https://${host}` && host.endsWith('.vercel.app') ? origin : '';
  return { ...process.env, TIVVLEJOY_SCENERY_CORS_ORIGIN: trustedPreviewOrigin };
}

function failure(error: unknown, token = '') {
  const message = error instanceof Error ? error.message : 'Purchased asset intake request failed.';
  return NextResponse.json(
    {
      error: redactSecretsFromText(message, [token]),
      uploaded: false,
      approved: false,
    },
    { status: /unauthorized|studio|Production/i.test(message) ? 401 : 400 },
  );
}

export async function GET() {
  return NextResponse.json({
    version: PURCHASED_TOOL_UPLOAD_VERSION,
    packages: publicPackages(),
    storage: describeSceneryStorageConfiguration(process.env),
    authorization: publicIntakeAuthorizationSnapshot(process.env),
    bytesPath: 'iphone-safari-to-signed-private-r2',
    productionMutation: false,
    uploadMeansApproval: false,
  });
}

export async function POST(request: Request) {
  const token = request.headers.get(SCENERY_INTAKE_TOKEN_HEADER) ?? '';
  try {
    const raw = await request.text();
    if (raw.length > 64 * 1024) throw new Error('Purchased asset intake JSON is too large.');
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    assertTokenOnlyFromApprovedHeader(body);
    assertNoClientStorageCredentials(body);
    const env = trustedEnv(request);
    assertStudioIntakeAccess(env, token);
    assertIntakeRateLimit(request.headers.get('x-forwarded-for') ?? 'purchased-tools-studio', env);
    const storageConfig = describeSceneryStorageConfiguration(env);
    if (!storageConfig.configured) throw new Error('Private R2 storage is not configured in this Preview.');
    const storage = await createConfiguredMultipartStorage(env);
    const action = String(body.action ?? '');
    let result: Record<string, unknown>;

    if (action === 'create') {
      const created = await createPurchasedToolSession({
        storage,
        env,
        sourceId: body.sourceId ? String(body.sourceId) : undefined,
        filename: String(body.filename ?? ''),
        byteSize: Number(body.byteSize ?? 0),
        mimeType: body.mimeType ? String(body.mimeType) : undefined,
        lastModified: body.lastModified ? String(body.lastModified) : null,
      });
      result = {
        session: publicPurchasedToolSession(created.session),
        alreadyStored: created.alreadyStored,
      };
    } else if (action === 'resume' || action === 'status') {
      const session = await loadPurchasedToolSession(storage, env, String(body.sessionId ?? ''));
      result = { session: publicPurchasedToolSession(session) };
    } else if (action === 'sign-part') {
      result = await signPurchasedToolPart({
        storage,
        env,
        sessionId: String(body.sessionId ?? ''),
        partNumber: Number(body.partNumber ?? 0),
      });
    } else if (action === 'record-part') {
      const session = await recordPurchasedToolPart({
        storage,
        env,
        sessionId: String(body.sessionId ?? ''),
        partNumber: Number(body.partNumber ?? 0),
        etag: String(body.etag ?? ''),
      });
      result = { session: publicPurchasedToolSession(session) };
    } else if (action === 'complete') {
      const completed = await completePurchasedToolSession({
        storage,
        env,
        sessionId: String(body.sessionId ?? ''),
      });
      result = {
        session: publicPurchasedToolSession(completed.session),
        storedSize: completed.storedSize,
        alreadyCompleted: completed.alreadyCompleted,
      };
    } else if (action === 'record-hash') {
      const session = await recordPurchasedToolHash({
        storage,
        env,
        sessionId: String(body.sessionId ?? ''),
        sha256: String(body.sha256 ?? ''),
      });
      result = { session: publicPurchasedToolSession(session) };
    } else if (action === 'abort') {
      const session = await abortPurchasedToolSession({
        storage,
        env,
        sessionId: String(body.sessionId ?? ''),
      });
      result = { session: publicPurchasedToolSession(session), aborted: session.state === 'aborted' };
    } else {
      throw new Error('Unknown purchased asset intake action.');
    }

    const payload = {
      ...result,
      approved: false,
      bytesPath: 'iphone-safari-to-signed-private-r2',
      productionMutation: false,
    };
    assertNoTokenReflection(payload, token);
    return NextResponse.json(
      JSON.parse(redactSecretsFromText(JSON.stringify(payload), [token])) as Record<string, unknown>,
    );
  } catch (error) {
    if (error instanceof SyntaxError) return failure(new Error('Purchased asset intake JSON is invalid.'), token);
    return failure(error, token);
  }
}

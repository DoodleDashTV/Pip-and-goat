import { NextResponse } from 'next/server';
import {
  assertIntakeRateLimit,
  assertStudioIntakeAccess,
  isProductionRuntime,
  publicIntakeAuthorizationSnapshot,
  redactSecretsFromText,
  SCENERY_INTAKE_TOKEN_HEADER,
} from '@/lib/scenery/intake/access';
import { describeSceneryStorageConfiguration } from '@/lib/scenery/intake/config';
import { createConfiguredMultipartStorage } from '@/lib/scenery/intake/r2-multipart';
import { PURCHASED_TOOL_PACKAGES } from '@/lib/purchased-tools/catalog';
import { loadPurchasedAssetAuditSnapshots } from '@/lib/purchased-tools/audit-storage';
import { auditPurchasedAssets, DYNAMIC_ASSET_AUDIT_SCHEMA } from '@/lib/purchased-tools/dynamic-audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function trustedEnv(request: Request): Record<string, string | undefined> {
  const origin = request.headers.get('origin') ?? '';
  const host = request.headers.get('host') ?? '';
  const trustedPreviewOrigin = origin === `https://${host}` && host.endsWith('.vercel.app') ? origin : '';
  return { ...process.env, TIVVLEJOY_SCENERY_CORS_ORIGIN: trustedPreviewOrigin };
}

export async function GET(request: Request) {
  const token = request.headers.get(SCENERY_INTAKE_TOKEN_HEADER) ?? '';
  const env = trustedEnv(request);
  const catalogOnly = auditPurchasedAssets({ catalog: PURCHASED_TOOL_PACKAGES });
  const storage = describeSceneryStorageConfiguration(env);
  if (!token) {
    return NextResponse.json({
      schemaVersion: DYNAMIC_ASSET_AUDIT_SCHEMA,
      receiptsLoaded: false,
      storage,
      authorization: publicIntakeAuthorizationSnapshot(env),
      audit: catalogOnly,
      readOnly: true,
      productionMutation: false,
    });
  }
  try {
    if (isProductionRuntime(env)) {
      return NextResponse.json({
        schemaVersion: DYNAMIC_ASSET_AUDIT_SCHEMA,
        receiptsLoaded: false,
        storage,
        authorization: publicIntakeAuthorizationSnapshot(env),
        audit: catalogOnly,
        readOnly: true,
        productionMutation: false,
        error: 'Purchased asset audit does not read Production storage.',
      });
    }
    assertStudioIntakeAccess(env, token);
    assertIntakeRateLimit(request.headers.get('x-forwarded-for') ?? 'purchased-tools-audit', env);
    if (!storage.configured) {
      return NextResponse.json({
        schemaVersion: DYNAMIC_ASSET_AUDIT_SCHEMA,
        receiptsLoaded: false,
        storage,
        authorization: publicIntakeAuthorizationSnapshot(env),
        audit: catalogOnly,
        readOnly: true,
        productionMutation: false,
      });
    }
    const port = await createConfiguredMultipartStorage(env);
    const snapshots = await loadPurchasedAssetAuditSnapshots({ storage: port, env });
    const audit = auditPurchasedAssets({
      catalog: PURCHASED_TOOL_PACKAGES,
      receipts: snapshots.receipts,
      sessions: snapshots.sessions,
      storedObjects: snapshots.storedObjects,
      inspections: snapshots.inspections,
    });
    return NextResponse.json({
      schemaVersion: DYNAMIC_ASSET_AUDIT_SCHEMA,
      receiptsLoaded: true,
      storage,
      authorization: publicIntakeAuthorizationSnapshot(env),
      audit,
      readOnly: true,
      productionMutation: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Purchased asset audit failed.';
    return NextResponse.json(
      {
        error: redactSecretsFromText(message, [token]),
        schemaVersion: DYNAMIC_ASSET_AUDIT_SCHEMA,
        receiptsLoaded: false,
        audit: catalogOnly,
        readOnly: true,
        productionMutation: false,
      },
      { status: /unauthorized|studio|Production/i.test(message) ? 401 : 400 },
    );
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error: 'Purchased asset audit is read-only. POST is refused.',
      readOnly: true,
      productionMutation: false,
    },
    { status: 405 },
  );
}

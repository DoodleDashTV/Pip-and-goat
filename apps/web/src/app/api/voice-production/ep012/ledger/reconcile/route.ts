import { NextResponse } from 'next/server';
import { z } from 'zod';
import '@/lib/voice-production/durable-voice-ledger-postgres';
import {
  EP012_LEDGER_RECONCILE_ADMIN_HEADER,
  EP012_LEDGER_RECONCILE_CODES,
  reconcileEp012DurableVoiceLedger,
} from '@/lib/voice-production/ep012-durable-ledger-reconcile';

const BodySchema = z
  .object({
    action: z.literal('reconcile-prior-usage'),
    confirmed: z.literal(true),
  })
  .strict();

function blockedBody(code: string, message: string) {
  return {
    schemaVersion: 'TIVVLEJOY_EP012_DURABLE_LEDGER_RECONCILIATION_V1',
    ok: false,
    status: 'BLOCKED',
    code,
    message,
    episodeId: 'EP012',
    imported: false,
    idempotentReplay: false,
    historicalTotals: {
      paidRequests: null,
      paidCharacters: null,
      evidencePresent: false,
    },
    ledger: null,
    ep012AuthorizedRequestCount: 11,
    ep012AuthorizedCharacterCount: 460,
    ep012EntriesObserved: 0,
    providerContacted: false,
    providerRequestsMade: 0,
    sceneryAccessed: false,
    sceneryRequestsMade: 0,
    commercialBytesDownloaded: 0,
    dialogueLockMutated: false,
    productionEnabled: false,
  } as const;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      blockedBody(
        EP012_LEDGER_RECONCILE_CODES.CONFIRMATION_REQUIRED,
        'A strict reconciliation body with explicit confirmation is required.',
      ),
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      blockedBody(
        EP012_LEDGER_RECONCILE_CODES.CONFIRMATION_REQUIRED,
        'Only action=reconcile-prior-usage with confirmed=true is accepted. Extra fields are refused.',
      ),
      { status: 400 },
    );
  }

  const result = await reconcileEp012DurableVoiceLedger({
    env: process.env,
    providedAdminToken: request.headers.get(EP012_LEDGER_RECONCILE_ADMIN_HEADER),
    confirmed: parsed.data.confirmed,
  });

  const { httpStatus, ...publicResult } = result;
  return NextResponse.json(publicResult, { status: httpStatus });
}

export async function GET() {
  return NextResponse.json(
    blockedBody(
      EP012_LEDGER_RECONCILE_CODES.CONFIRMATION_REQUIRED,
      'Historical reconciliation is a POST-only, explicitly confirmed Preview admin operation.',
    ),
    { status: 405, headers: { Allow: 'POST' } },
  );
}

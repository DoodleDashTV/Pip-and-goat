import { NextResponse } from 'next/server';
import '@/lib/voice-production/durable-voice-ledger-postgres';
import {
  EP012_BLOCKER_CODES,
  EP012_NO_PROVIDER_PREFLIGHT_SCHEMA,
  runEp012NoProviderPreflight,
} from '@/lib/tivvlejoy-real-production-unblock/ep012-no-provider-preflight';

export async function GET() {
  try {
    const result = await runEp012NoProviderPreflight({ env: process.env });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      schemaVersion: EP012_NO_PROVIDER_PREFLIGHT_SCHEMA,
      ok: false,
      status: 'BLOCKED',
      episodeId: 'EP012',
      title: 'The Bakery Map',
      blockers: [EP012_BLOCKER_CODES.EP012_LEDGER_UNAVAILABLE],
      readyForProviderContact: false,
      nextProviderContactPermitted: false,
      providerContacted: false,
      providerRequestsMade: 0,
      sceneryAccessed: false,
      sceneryRequestsMade: 0,
      commercialBytesDownloaded: 0,
      dialogueLockMutated: false,
      productionEnabled: false,
    });
  }
}

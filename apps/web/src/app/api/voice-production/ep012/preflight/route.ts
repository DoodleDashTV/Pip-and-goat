import { NextResponse } from 'next/server';
import '@/lib/voice-production/durable-voice-ledger-postgres';
import { runEp012NoProviderPreflight } from '@/lib/tivvlejoy-real-production-unblock/ep012-no-provider-preflight';

export async function GET() {
  const result = await runEp012NoProviderPreflight({ env: process.env });
  return NextResponse.json(result);
}

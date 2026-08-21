import { NextResponse } from 'next/server';
import { EP012_VOICE_TEST_TOKEN_HEADER } from '@/lib/tivvlejoy-real-production-unblock/ep012-no-provider-preflight';
import { runEp012StorageProbe } from '@/lib/tivvlejoy-real-production-unblock/ep012-storage-probe';

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const result = await runEp012StorageProbe({
    body,
    origin: request.headers.get('origin'),
    host: request.headers.get('host'),
    testToken: String(request.headers.get(EP012_VOICE_TEST_TOKEN_HEADER) ?? '').trim(),
    env: process.env,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function GET() {
  return NextResponse.json(
    {
      schemaVersion: 'TIVVLEJOY_EP012_STORAGE_PROBE_V1',
      ok: false,
      status: 'BLOCKED',
      message: 'The EP012 storage probe is a Preview-only confirmed POST. It was not executed.',
      providerContacted: false,
      providerRequestsMade: 0,
      sceneryAccessed: false,
      productionEnabled: false,
    },
    { status: 405, headers: { Allow: 'POST' } },
  );
}

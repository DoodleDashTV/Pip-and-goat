import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const POD_NAME = 'tivvlejoy-scenery-showcase-30s-v1';
const AUTHORIZATION = 'TIVVLEJOY_SCENERY_SHOWCASE_30S_PAID_EXECUTION_AUTHORIZATION_V1';

function clean(value: string | null | undefined) {
  return String(value || '').replace(/[\r\n]+/g, '').trim();
}

async function runpod(runpodKey: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${runpodKey}`,
      'User-Agent': 'TivvleJoySceneryCleanup/1.0',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok || parsed?.errors?.length) throw new Error('RUNPOD_REQUEST_FAILED');
  return parsed.data || {};
}

function authorized(request: Request) {
  if (clean(request.headers.get('x-tivvlejoy-scenery-authorization')) !== AUTHORIZATION) {
    throw new Error('PAID_AUTHORIZATION_REQUIRED');
  }
  const key = clean(request.headers.get('x-tivvlejoy-runpod-key'));
  if (!key) throw new Error('RUNPOD_KEY_REQUIRED');
  return key;
}

function active(status: string | null | undefined) {
  return !['TERMINATED', 'EXITED', 'STOPPED'].includes(clean(status).toUpperCase());
}

export async function POST(request: Request) {
  try {
    const key = authorized(request);
    const before = await runpod(key, `query { myself { pods { id name desiredStatus costPerHr } } }`);
    const matches = (before?.myself?.pods || []).filter((pod: any) => pod?.name === POD_NAME && active(pod?.desiredStatus));
    const terminated: string[] = [];
    for (const pod of matches) {
      const id = clean(pod?.id);
      if (!id) continue;
      await runpod(key, `mutation($podId: String!) { podTerminate(input: { podId: $podId }) }`, { podId: id });
      terminated.push(id);
    }
    const after = await runpod(key, `query { myself { pods { id name desiredStatus } } }`);
    const remaining = (after?.myself?.pods || []).filter((pod: any) => pod?.name === POD_NAME && active(pod?.desiredStatus));
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_CLEANUP_V1',
      exactName: POD_NAME,
      matchedBefore: matches.length,
      terminatedCount: terminated.length,
      remainingActiveExactName: remaining.length,
      billingCleanupConfirmed: remaining.length === 0,
      createPerformed: false,
    });
  } catch (error) {
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_CLEANUP_V1',
      error: clean((error as Error).message).slice(0, 180) || 'CLEANUP_FAILED',
      createPerformed: false,
    }, { status: 400 });
  }
}

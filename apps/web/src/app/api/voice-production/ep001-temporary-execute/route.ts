import { NextResponse } from 'next/server';
import { runTemporaryEp001VoiceExecution } from '@/lib/tivvlejoy-ep001-temporary-connected-voice-execution';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await runTemporaryEp001VoiceExecution({
    lineId: url.searchParams.get('lineId'),
    authorizationSha256: url.searchParams.get('authorizationSha256'),
  });
  const status = result.status === 'SUCCEEDED' || result.status === 'ALREADY_SUCCEEDED' ? 200 : 409;
  return NextResponse.json(result, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

import { NextResponse } from 'next/server';
import '@/lib/voice-production/durable-voice-ledger-postgres';
import {
  readEp012VoiceTestTokenFromHeaders,
  retrieveEp012AuthorizedAudio,
} from '@/lib/tivvlejoy-real-production-unblock/ep012-audio-retrieval';
import { EP012_AUDIO_RETRIEVAL_SCHEMA } from '@/lib/tivvlejoy-real-production-unblock/ep012-paid-voice-constants';
import { EP012_BLOCKER_CODES } from '@/lib/tivvlejoy-real-production-unblock/ep012-no-provider-preflight';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const extraQueryKeys = [...url.searchParams.keys()].filter((key) => key !== 'segmentId' && key !== 'kind');
    const result = await retrieveEp012AuthorizedAudio({
      segmentId: url.searchParams.get('segmentId'),
      kind: url.searchParams.get('kind'),
      extraQueryKeys,
      objectKey: url.searchParams.get('key') ?? url.searchParams.get('objectKey'),
      origin: request.headers.get('origin'),
      host: request.headers.get('host'),
      testToken: readEp012VoiceTestTokenFromHeaders(request.headers),
      env: process.env,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    if (result.kind === 'receipt') {
      return NextResponse.json(result.receipt);
    }
    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        'content-type': result.contentType,
        'x-ep012-segment-id': result.segmentId,
      },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        schemaVersion: EP012_AUDIO_RETRIEVAL_SCHEMA,
        status: 'BLOCKED',
        blockers: [EP012_BLOCKER_CODES.EP012_EXECUTION_LEDGER_UNAVAILABLE],
        providerContacted: false,
        providerRequestsMade: 0,
        sceneryAccessed: false,
        productionEnabled: false,
      },
      { status: 400 },
    );
  }
}

import { NextResponse } from 'next/server';
import '@/lib/voice-production/durable-voice-ledger-postgres';
import {
  readEp012VoiceTestToken,
  runEp012GenerateGuard,
} from '@/lib/tivvlejoy-real-production-unblock/ep012-generate-guard';

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const result = await runEp012GenerateGuard({
    body,
    origin: request.headers.get('origin'),
    host: request.headers.get('host'),
    testToken: readEp012VoiceTestToken(request.headers),
    env: process.env,
  });

  const status = result.status === 'BLOCKED' ? 400 : 200;
  return NextResponse.json(result, { status });
}

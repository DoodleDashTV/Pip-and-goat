import { NextResponse } from 'next/server';
import '@/lib/voice-production/durable-voice-ledger-postgres';
import { readEp012VoiceTestToken } from '@/lib/tivvlejoy-real-production-unblock/ep012-generate-guard';
import {
  createEp012GenerateFailClosedResult,
  runEp012PaidVoiceExecution,
} from '@/lib/tivvlejoy-real-production-unblock/ep012-paid-voice-execution';
import { EP012_BLOCKER_CODES } from '@/lib/tivvlejoy-real-production-unblock/ep012-no-provider-preflight';
import { VoiceProductionError } from '@/lib/voice-production/types';

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  try {
    const result = await runEp012PaidVoiceExecution({
      body,
      origin: request.headers.get('origin'),
      host: request.headers.get('host'),
      testToken: readEp012VoiceTestToken(request.headers),
      env: process.env,
    });

    const status = result.status === 'BLOCKED' || result.status === 'RECOVERY_REQUIRED' ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    const blockers =
      error instanceof VoiceProductionError &&
      (Object.values(EP012_BLOCKER_CODES) as string[]).includes(error.code)
        ? [error.code as (typeof EP012_BLOCKER_CODES)[keyof typeof EP012_BLOCKER_CODES]]
        : error instanceof VoiceProductionError && error.code === 'DURABLE_LEDGER_UNAVAILABLE'
          ? [EP012_BLOCKER_CODES.EP012_LEDGER_UNAVAILABLE]
          : error instanceof VoiceProductionError && error.code === 'EP012_EXECUTION_LEDGER_UNAVAILABLE'
            ? [EP012_BLOCKER_CODES.EP012_EXECUTION_LEDGER_UNAVAILABLE]
            : [];
    return NextResponse.json(createEp012GenerateFailClosedResult(blockers), { status: 400 });
  }
}

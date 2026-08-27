import { NextResponse } from 'next/server';
import {
  compileCurrentEp001ContractSnapshot,
  evaluateEp001ContractWatchdog,
  type Ep001ContractSnapshot,
} from '@/lib/tivvlejoy-ep001-contract-watchdog';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    persisted: false,
    authorityGranted: false,
    current: compileCurrentEp001ContractSnapshot(),
  });
}

export async function POST(request: Request) {
  let body: Ep001ContractSnapshot;
  try {
    body = (await request.json()) as Ep001ContractSnapshot;
  } catch {
    return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, persisted: false, authorityGranted: false, error: 'INVALID_CONTRACT_SNAPSHOT' }, { status: 400 });
  }

  try {
    const report = evaluateEp001ContractWatchdog(body);
    return NextResponse.json({ ok: true, persisted: false, authorityGranted: false, report });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      persisted: false,
      authorityGranted: false,
      error: error instanceof Error ? error.message : 'CONTRACT_WATCHDOG_FAILED',
    }, { status: 400 });
  }
}

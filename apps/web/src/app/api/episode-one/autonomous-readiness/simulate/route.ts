import { NextResponse } from 'next/server';
import { compileEp001AutonomousReadinessController } from '@/lib/tivvlejoy-ep001-autonomous-readiness-controller';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const observedTriggerIds =
    typeof body === 'object' && body !== null && Array.isArray((body as { observedTriggerIds?: unknown }).observedTriggerIds)
      ? (body as { observedTriggerIds: unknown[] }).observedTriggerIds
      : [];

  if (!observedTriggerIds.every((value) => typeof value === 'string')) {
    return NextResponse.json({ ok: false, error: 'INVALID_TRIGGER_ID_LIST' }, { status: 400 });
  }

  try {
    const controller = compileEp001AutonomousReadinessController({
      observedTriggerIds: observedTriggerIds as string[],
    });
    return NextResponse.json({
      ok: true,
      persisted: false,
      authorityGranted: false,
      controller,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        persisted: false,
        authorityGranted: false,
        error: error instanceof Error ? error.message : 'READINESS_SIMULATION_FAILED',
      },
      { status: 400 },
    );
  }
}

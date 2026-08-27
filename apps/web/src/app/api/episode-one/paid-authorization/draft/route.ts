import { NextResponse } from 'next/server';
import { prepareEp001PaidAuthorizationDraft } from '@/lib/tivvlejoy-ep001-paid-authorization-draft';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const draft = prepareEp001PaidAuthorizationDraft({
      authorizationId: String(body.authorizationId ?? ''),
      scope: String(body.scope ?? '') as 'EP001_VOICE_GENERATION' | 'EP001_FINAL_RENDER',
      costCeilingUsd: Number(body.costCeilingUsd ?? 0),
      expiresAtIso: body.expiresAtIso ? String(body.expiresAtIso) : undefined,
      oneShot: body.oneShot === true,
      note: body.note ? String(body.note) : undefined,
    });
    return NextResponse.json(draft, { status: draft.validation.valid ? 200 : 422, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
  } catch {
    return NextResponse.json({ error: 'PAID_AUTHORIZATION_DRAFT_INVALID', explicitAuthorizationRecorded: false, paidExecutionAuthorized: false }, { status: 400 });
  }
}

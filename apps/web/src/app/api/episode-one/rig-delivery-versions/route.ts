import { NextResponse } from 'next/server';
import { characterIntakeAuthorized, EP001_RIG_INTAKE_TOKEN_HEADER } from '@/lib/tivvlejoy-ep001-rig-delivery-intake';
import { compileEp001RigDeliveryLedger } from '@/lib/tivvlejoy-ep001-rig-delivery-ledger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';

export async function POST(request: Request) {
  const token = request.headers.get(EP001_RIG_INTAKE_TOKEN_HEADER) ?? '';
  if (process.env.VERCEL_ENV !== 'preview' || !characterIntakeAuthorized({ token, env: process.env })) {
    return NextResponse.json({ error: 'Rig delivery ledger authorization refused.', approved: false }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const characterId = String(body.characterId ?? '') as CharacterId;
  if (characterId !== 'CHAR_PIP_001' && characterId !== 'CHAR_GOAT_001') {
    return NextResponse.json({ error: 'RIG_CHARACTER_ID_INVALID', approved: false }, { status: 400 });
  }
  try {
    const ledger = await compileEp001RigDeliveryLedger({ characterId, env: process.env });
    return NextResponse.json(ledger, { status: 200, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
  } catch {
    return NextResponse.json({ error: 'Rig delivery ledger unavailable.', approved: false }, { status: 400 });
  }
}

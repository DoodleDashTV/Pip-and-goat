import { NextResponse } from 'next/server';
import { compileRigPostValidationReview, type RigPostValidationReviewInput } from '@/lib/tivvlejoy-rig-post-validation-review';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as RigPostValidationReviewInput | null;
  if (!body || (body.characterId !== 'CHAR_PIP_001' && body.characterId !== 'CHAR_GOAT_001')) return NextResponse.json({ code: 'RIG_REVIEW_INPUT_INVALID' }, { status: 400 });
  const packet = compileRigPostValidationReview(body);
  return NextResponse.json(packet, { status: packet.structurallyReadyForHumanReview ? 200 : 422, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
}

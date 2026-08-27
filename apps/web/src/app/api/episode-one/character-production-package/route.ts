import { NextResponse } from 'next/server';
import { compileCharacterProductionPackage, type CharacterProductionPackageInput } from '@/lib/tivvlejoy-character-production-package';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as CharacterProductionPackageInput | null;
  if (!body || (body.characterId !== 'CHAR_PIP_001' && body.characterId !== 'CHAR_GOAT_001')) return NextResponse.json({ code: 'CHARACTER_PACKAGE_INPUT_INVALID' }, { status: 400 });
  const compiled = compileCharacterProductionPackage(body);
  return NextResponse.json(compiled, { status: compiled.structurallyComplete ? 200 : 422, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
}

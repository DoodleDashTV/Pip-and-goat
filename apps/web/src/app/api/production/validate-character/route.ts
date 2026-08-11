import { NextResponse } from 'next/server';
import { characterAssetValidator } from '@doodle-dash/production';
import { characterService } from '@doodle-dash/characters';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

const BodySchema = z.object({
  characterId: z.string().uuid().optional(),
  characterCode: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    let characterId = body.characterId;
    if (!characterId && body.characterCode) {
      const character = await characterService.getByCode(body.characterCode);
      characterId = character.id;
    }
    if (!characterId) {
      return NextResponse.json({ error: 'characterId or characterCode required' }, { status: 400 });
    }
    const report = await characterAssetValidator.validate(characterId);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    throw error;
  }
}

import { NextResponse } from 'next/server';
import { studioSettingsService } from '@doodle-dash/characters';
import { z } from 'zod';

export async function GET() {
  const strictCharacterLock = await studioSettingsService.isStrictCharacterLockEnabled();
  return NextResponse.json({
    settings: {
      STRICT_CHARACTER_LOCK: strictCharacterLock,
    },
  });
}

const BodySchema = z.object({
  STRICT_CHARACTER_LOCK: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const body = BodySchema.parse(await request.json());
  if (typeof body.STRICT_CHARACTER_LOCK === 'boolean') {
    await studioSettingsService.setBoolean('STRICT_CHARACTER_LOCK', body.STRICT_CHARACTER_LOCK);
  }
  const strictCharacterLock = await studioSettingsService.isStrictCharacterLockEnabled();
  return NextResponse.json({
    settings: {
      STRICT_CHARACTER_LOCK: strictCharacterLock,
    },
  });
}

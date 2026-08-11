import { NextResponse } from 'next/server';
import { voiceProductionService } from '@doodle-dash/production';
import { characterService } from '@doodle-dash/characters';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

export async function GET() {
  const founding = await characterService.getFoundingCharacters();
  const configs = [];
  for (const character of founding) {
    configs.push({
      character: { id: character.id, code: character.internalCode, name: character.name },
      config: await voiceProductionService.getOrCreate(character.id),
    });
  }
  return NextResponse.json({ voices: configs });
}

const ConfigureSchema = z.object({
  characterId: z.string().uuid(),
  provider: z.string().nullable().optional(),
  voiceId: z.string().nullable().optional(),
  voiceVersion: z.string().nullable().optional(),
  speed: z.number().nullable().optional(),
  pitch: z.number().nullable().optional(),
  stability: z.number().nullable().optional(),
  pronunciationDictionary: z.record(z.unknown()).nullable().optional(),
  emotionalDelivery: z.record(z.unknown()).nullable().optional(),
  auditionNotes: z.string().nullable().optional(),
  approve: z.boolean().optional(),
  approvedBy: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = ConfigureSchema.parse(await request.json());
    if (body.approve) {
      if (!body.approvedBy) {
        return NextResponse.json({ error: 'approvedBy required to approve' }, { status: 400 });
      }
      const approved = await voiceProductionService.approve(body.characterId, body.approvedBy);
      return NextResponse.json({ config: approved });
    }
    const config = await voiceProductionService.configure(body);
    return NextResponse.json({ config });
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

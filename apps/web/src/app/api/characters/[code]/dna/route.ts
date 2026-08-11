import { NextResponse } from 'next/server';
import {
  characterDnaService,
  characterService,
  UpdatePersonalityDnaSchema,
  UpdateStoryDnaSchema,
  UpdateVisualDnaSchema,
} from '@doodle-dash/characters';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const character = await characterService.getByCode(code);
    const dna = await characterDnaService.getBundle(character.id);
    return NextResponse.json({ dna });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    throw error;
  }
}

const BodySchema = z.object({
  personality: UpdatePersonalityDnaSchema.optional(),
  story: UpdateStoryDnaSchema.optional(),
  visual: UpdateVisualDnaSchema.optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const character = await characterService.getByCode(code);
    const body = BodySchema.parse(await request.json());

    const result: Record<string, unknown> = {};
    if (body.personality) {
      result.personality = await characterDnaService.updatePersonality(
        character.id,
        body.personality,
      );
    }
    if (body.story) {
      result.story = await characterDnaService.updateStory(character.id, body.story);
    }
    if (body.visual) {
      result.visual = await characterDnaService.updateVisual(character.id, body.visual);
    }

    return NextResponse.json({ dna: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: (error as Error).message } },
      { status: 400 },
    );
  }
}

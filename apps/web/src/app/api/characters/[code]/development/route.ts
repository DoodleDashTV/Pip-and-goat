import { NextResponse } from 'next/server';
import {
  characterDevelopmentService,
  characterService,
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
    const [development, events] = await Promise.all([
      characterDevelopmentService.get(character.id),
      characterDevelopmentService.listEvents(character.id),
    ]);
    return NextResponse.json({ development, events });
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
  attribute: z.enum([
    'confidence',
    'courage',
    'patience',
    'empathy',
    'leadership',
    'independence',
    'curiosity',
    'responsibility',
  ]),
  newValue: z.number().int().min(0).max(100),
  storyEventRef: z.string().min(1),
  episodeId: z.string().uuid().nullable().optional(),
  summary: z.string().nullable().optional(),
  approved: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const character = await characterService.getByCode(code);
    const body = BodySchema.parse(await request.json());
    const result = await characterDevelopmentService.applyEvent({
      characterId: character.id,
      ...body,
      approved: body.approved ?? false,
    });
    return NextResponse.json(result, { status: 201 });
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

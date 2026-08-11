import { NextResponse } from 'next/server';
import { relationshipService } from '@doodle-dash/characters';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

const BodySchema = z.object({
  attribute: z.enum([
    'trust',
    'friendship',
    'respect',
    'dependence',
    'tension',
    'rivalry',
    'familiarity',
  ]),
  newValue: z.number().int().min(0).max(100),
  storyEventRef: z.string().min(1),
  episodeId: z.string().uuid().nullable().optional(),
  summary: z.string().nullable().optional(),
  approved: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = BodySchema.parse(await request.json());
    const result = await relationshipService.applyEvent({
      relationshipId: id,
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

import { NextResponse } from 'next/server';
import {
  characterModelService,
  characterService,
} from '@doodle-dash/characters';
import { AppError } from '@doodle-dash/shared';
import { MODEL_STATUS_FLOW } from '@doodle-dash/domain';
import { z } from 'zod';

const BodySchema = z.object({
  modelId: z.string().uuid(),
  status: z.enum(MODEL_STATUS_FLOW),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    await characterService.getByCode(code);
    const body = BodySchema.parse(await request.json());
    const model = await characterModelService.updateStatus(body.modelId, body.status);
    return NextResponse.json({ model });
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

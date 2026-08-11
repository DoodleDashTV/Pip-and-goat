import { NextResponse } from 'next/server';
import { characterService } from '@doodle-dash/characters';
import { AppError } from '@doodle-dash/shared';

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const character = await characterService.getByCode(code);
    return NextResponse.json({ character });
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

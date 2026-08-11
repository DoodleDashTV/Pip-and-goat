import { NextResponse } from 'next/server';
import { characterPreflightService, characterService } from '@doodle-dash/characters';
import { AppError } from '@doodle-dash/shared';

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const character = await characterService.getByCode(code);
    const preflight = await characterPreflightService.runForCharacter(character.id);
    return NextResponse.json({ preflight });
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

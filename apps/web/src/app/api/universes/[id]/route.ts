import { NextResponse } from 'next/server';
import { universeService } from '@doodle-dash/universe';
import { AppError } from '@doodle-dash/shared';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const universe = await universeService.getUniverse(id);
    return NextResponse.json({ universe });
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

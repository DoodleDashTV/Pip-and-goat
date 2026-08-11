import { NextResponse } from 'next/server';
import { canonService } from '@doodle-dash/universe';
import { AppError } from '@doodle-dash/shared';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string };
    if (body.action === 'lock') {
      const fact = await canonService.lockCanonFact(id);
      return NextResponse.json({ fact });
    }
    if (body.action === 'unlock') {
      const fact = await canonService.unlockCanonFact(id);
      return NextResponse.json({ fact });
    }
    return NextResponse.json(
      { error: { code: 'INVALID_ACTION', message: 'action must be lock or unlock' } },
      { status: 400 },
    );
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

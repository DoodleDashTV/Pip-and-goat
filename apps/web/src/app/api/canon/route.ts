import { NextResponse } from 'next/server';
import { canonService, universeService } from '@doodle-dash/universe';
import { CreateCanonFactSchema } from '@doodle-dash/domain';
import { AppError } from '@doodle-dash/shared';

export async function GET() {
  const universe = await universeService.getPrimaryUniverse();
  if (!universe) {
    return NextResponse.json({ facts: [] });
  }
  const facts = await canonService.listCanon(universe.id);
  return NextResponse.json({ facts });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = CreateCanonFactSchema.parse(body);
    const fact = await canonService.createCanonFact(input);
    return NextResponse.json({ fact }, { status: 201 });
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

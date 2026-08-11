import { NextResponse } from 'next/server';
import { assetIntakeService, RegisterIntakeSchema } from '@doodle-dash/production';
import { prisma } from '@doodle-dash/database';
import { AppError } from '@doodle-dash/shared';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');
  if (entityType && entityId) {
    const items = await assetIntakeService.listForEntity(entityType, entityId);
    return NextResponse.json({ intakes: items });
  }
  const intakes = await prisma.productionAssetIntake.findMany({
    orderBy: [{ entityType: 'asc' }, { entityId: 'asc' }, { kind: 'asc' }],
    take: 500,
  });
  return NextResponse.json({ intakes });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const intake = await assetIntakeService.register(RegisterIntakeSchema.parse(body));
    return NextResponse.json({ intake }, { status: 201 });
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

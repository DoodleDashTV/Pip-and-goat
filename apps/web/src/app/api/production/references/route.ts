import { NextResponse } from 'next/server';
import { referenceLockService } from '@doodle-dash/production';
import { AppError } from '@doodle-dash/shared';
import { prisma } from '@doodle-dash/database';
import { z } from 'zod';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const characterId = searchParams.get('characterId');
  const refs = await prisma.approvedCharacterReference.findMany({
    where: characterId ? { characterId } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ references: refs });
}

const ApproveSchema = z.object({
  characterId: z.string().uuid(),
  referenceImageId: z.string().uuid(),
  approvedBy: z.string().min(1),
  palette: z.unknown().optional(),
  proportions: z.unknown().optional(),
  silhouette: z.string().optional(),
  clothing: z.string().optional(),
  accessories: z.string().optional(),
  forbiddenChanges: z.string().optional(),
});

const AssertSchema = z.object({
  assertConditioning: z.literal(true),
  characterId: z.string().uuid(),
  providerSupportsReferenceImages: z.boolean(),
  referenceConditioningSucceeded: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.assertConditioning) {
      const parsed = AssertSchema.parse(body);
      await referenceLockService.assertReferenceConditioning(parsed);
      return NextResponse.json({ ok: true });
    }
    const parsed = ApproveSchema.parse(body);
    const locked = await referenceLockService.approvePrimary(parsed);
    return NextResponse.json({ reference: locked }, { status: 201 });
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

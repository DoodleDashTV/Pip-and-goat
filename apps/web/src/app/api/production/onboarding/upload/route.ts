import { NextResponse } from 'next/server';
import {
  characterOnboardingService,
  environmentOnboardingService,
  propOnboardingService,
  VERTICAL_SLICE_EPISODE_ID,
} from '@doodle-dash/production';
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { AppError } from '@doodle-dash/shared';

async function readUpload(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new AppError('file is required', 'FILE_REQUIRED', 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    fileName: file.name,
    bytes,
    contentType: file.type || undefined,
    kind: String(form.get('kind') || ''),
    entityCode: String(form.get('entityCode') || ''),
    entityId: String(form.get('entityId') || ''),
  };
}

export async function GET() {
  const [pip, goat, meadow, prop] = await Promise.all([
    prisma.character.findUnique({ where: { internalCode: FOUNDING_CODES.PIP } }),
    prisma.character.findUnique({ where: { internalCode: FOUNDING_CODES.GOAT } }),
    prisma.location.findFirst({ where: { internalCode: 'LOC_MEADOW_001' } }),
    propOnboardingService.ensureMapPropProfile(),
  ]);
  const intakes = await prisma.productionAssetIntake.findMany({
    orderBy: [{ entityType: 'asc' }, { kind: 'asc' }, { version: 'desc' }],
    take: 400,
  });
  const inspections = await prisma.characterModelInspection.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({
    episodeId: VERTICAL_SLICE_EPISODE_ID,
    pip,
    goat,
    meadow,
    prop,
    intakes,
    inspections,
  });
}

export async function POST(request: Request) {
  try {
    const upload = await readUpload(request);
    const universe = await prisma.universe.findFirstOrThrow();

    if (upload.entityCode === FOUNDING_CODES.PIP || upload.entityCode === FOUNDING_CODES.GOAT) {
      const character = await prisma.character.findUniqueOrThrow({
        where: { internalCode: upload.entityCode },
      });
      if (
        ['TEXTURE', 'MATERIAL', 'REFERENCE_IMAGE', 'PRIMARY_CANONICAL_REFERENCE', 'TURNAROUND', 'EXPRESSION_SHEET', 'POSE_REFERENCE', 'FACIAL_SHAPEKEYS', 'RIG'].includes(
          upload.kind,
        )
      ) {
        const result = await characterOnboardingService.uploadTextureOrReference({
          characterId: character.id,
          universeId: universe.id,
          kind: upload.kind as 'TEXTURE',
          fileName: upload.fileName,
          bytes: upload.bytes,
          contentType: upload.contentType,
        });
        return NextResponse.json(result, { status: 201 });
      }
      const result = await characterOnboardingService.uploadModel({
        characterId: character.id,
        universeId: universe.id,
        fileName: upload.fileName,
        bytes: upload.bytes,
        contentType: upload.contentType,
      });
      return NextResponse.json(result, { status: 201 });
    }

    if (upload.entityCode === 'LOC_MEADOW_001') {
      const meadow = await prisma.location.findFirstOrThrow({
        where: { internalCode: 'LOC_MEADOW_001' },
      });
      const result = await environmentOnboardingService.uploadEnvironment({
        locationId: meadow.id,
        universeId: universe.id,
        fileName: upload.fileName,
        bytes: upload.bytes,
        contentType: upload.contentType,
        kind: (upload.kind as 'LOCATION_BLEND') || 'LOCATION_BLEND',
      });
      const validation = await environmentOnboardingService.validate(meadow.id);
      return NextResponse.json({ ...result, validation }, { status: 201 });
    }

    if (upload.entityCode === 'PROP_MAP_001') {
      const prop = await prisma.prop.findFirstOrThrow({ where: { internalCode: 'PROP_MAP_001' } });
      const result = await propOnboardingService.uploadPropModel({
        propId: prop.id,
        universeId: universe.id,
        fileName: upload.fileName,
        bytes: upload.bytes,
        contentType: upload.contentType,
      });
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json({ error: 'Unknown entityCode' }, { status: 400 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}

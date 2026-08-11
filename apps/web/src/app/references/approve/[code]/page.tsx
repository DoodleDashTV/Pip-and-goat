import { prisma } from '@doodle-dash/database';
import {
  PIP_CANONICAL_DNA,
  GOAT_CANONICAL_DNA,
  canonicalCharacterService,
} from '@doodle-dash/production';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { ReferenceApproveClient } from '@/components/ReferenceApproveClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function dnaLines(code: string): string[] {
  if (code === FOUNDING_CODES.PIP) {
    const d = PIP_CANONICAL_DNA;
    return [
      `${d.species}`,
      `Body: ${d.body.primaryColor}; ${d.body.surface}`,
      `Proportions: ${d.body.proportions}`,
      `Comb: ${d.head.comb}`,
      `Eyes: ${d.head.eyes}`,
      `Accessory: ${d.accessories.backpack.description}`,
      `DNA version ${d.dnaVersion}`,
    ];
  }
  if (code === FOUNDING_CODES.GOAT) {
    const d = GOAT_CANONICAL_DNA;
    return [
      `${d.species}`,
      `Body: ${d.body.primaryColor}; ${d.body.surface}`,
      `Proportions: ${d.body.proportions}`,
      `Horns: ${d.head.horns}`,
      `Eyes: ${d.head.eyes}`,
      `Accessory: ${d.accessories.collar.description}`,
      `DNA version ${d.dnaVersion}`,
    ];
  }
  return ['Locked visual DNA applies after founding bootstrap.'];
}

function parseMeta(notes: string | null): { sha256?: string; fileName?: string } {
  if (!notes) return {};
  try {
    return JSON.parse(notes) as { sha256?: string; fileName?: string };
  } catch {
    return {};
  }
}

export default async function ReferenceApprovePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (code === FOUNDING_CODES.PIP || code === FOUNDING_CODES.GOAT) {
    await canonicalCharacterService.bootstrapFoundingCharacters();
  }

  const character = await prisma.character.findUnique({
    where: { internalCode: code },
    include: {
      referenceImages: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!character) notFound();

  const assetIds = character.referenceImages
    .map((img) => img.assetId)
    .filter((id): id is string => Boolean(id));
  const assets = assetIds.length
    ? await prisma.asset.findMany({ where: { id: { in: assetIds } } })
    : [];
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const versions = await prisma.approvedReferenceVersion.findMany({
    where: { characterId: character.id },
    orderBy: { versionNumber: 'desc' },
  });

  return (
    <ReferenceApproveClient
      characterId={character.id}
      characterCode={character.internalCode}
      characterName={character.name}
      dnaSummary={dnaLines(character.internalCode)}
      images={character.referenceImages.map((img) => {
        const meta = parseMeta(img.notes);
        const asset = img.assetId ? assetById.get(img.assetId) : undefined;
        return {
          id: img.id,
          label: img.title,
          reviewStatus: img.reviewStatus,
          assetId: img.assetId,
          fileName: meta.fileName ?? asset?.name ?? img.title,
          sha256: meta.sha256 ?? asset?.hash ?? null,
          viewType: img.viewType,
          isPrimary: img.isPrimary,
        };
      })}
      versions={versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        approvedAt: v.approvedAt.toISOString(),
        primaryImageId: v.primaryImageId,
        immutable: v.immutable,
      }))}
    />
  );
}

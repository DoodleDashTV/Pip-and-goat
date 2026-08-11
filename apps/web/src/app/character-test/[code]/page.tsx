import { prisma } from '@doodle-dash/database';
import { CharacterTestClient } from '@/components/CharacterTestClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function parseMeta(notes: string | null): { sha256?: string; fileName?: string } {
  if (!notes) return {};
  try {
    return JSON.parse(notes) as { sha256?: string; fileName?: string };
  } catch {
    return {};
  }
}

export default async function CharacterTestPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const character = await prisma.character.findUnique({
    where: { internalCode: code },
    include: {
      referenceImages: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!character) notFound();

  const approvedRef = character.referenceImages.find(
    (r) => r.isPrimary && r.reviewStatus === 'APPROVED' && r.assetId,
  );
  const pendingReview = await prisma.productionModelReview.findFirst({
    where: { characterId: character.id },
    orderBy: { createdAt: 'desc' },
  });
  const modelIntake = await prisma.productionAssetIntake.findFirst({
    where: {
      entityType: 'character',
      entityId: character.id,
      kind: { in: ['CHARACTER_BLEND', 'CHARACTER_GLB', 'CHARACTER_GLTF'] },
      storageLocation: { not: null },
    },
    orderBy: { version: 'desc' },
  });

  return (
    <CharacterTestClient
      characterId={character.id}
      characterCode={character.internalCode}
      characterName={character.name}
      referencePreviewUrl={
        approvedRef?.assetId ? `/api/production/media?assetId=${approvedRef.assetId}` : null
      }
      referenceMeta={{
        fileName: parseMeta(approvedRef?.notes ?? null).fileName ?? approvedRef?.title ?? null,
        sha256: parseMeta(approvedRef?.notes ?? null).sha256 ?? null,
        version: pendingReview?.referenceVersionId ?? null,
      }}
      modelCandidate={{
        version: modelIntake?.version ?? null,
        checksum: modelIntake?.checksum ?? null,
        fileName: modelIntake?.originalFilename ?? null,
        status: modelIntake?.approvalStatus ?? null,
      }}
      modelReviewId={pendingReview?.id ?? null}
      modelReviewStatus={pendingReview?.status ?? null}
    />
  );
}

import { prisma } from '@doodle-dash/database';
import { ReferenceApproveClient } from '@/components/ReferenceApproveClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ReferenceApprovePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const character = await prisma.character.findUnique({
    where: { internalCode: code },
    include: { referenceImages: true },
  });
  if (!character) notFound();
  const versions = await prisma.approvedReferenceVersion.findMany({
    where: { characterId: character.id },
    orderBy: { versionNumber: 'desc' },
  });
  return (
    <ReferenceApproveClient
      characterId={character.id}
      characterCode={character.internalCode}
      characterName={character.name}
      images={character.referenceImages.map((img) => ({
        id: img.id,
        label: img.title,
        reviewStatus: img.reviewStatus,
        assetId: img.assetId,
      }))}
      versions={versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        approvedAt: v.approvedAt.toISOString(),
        primaryImageId: v.primaryImageId,
      }))}
    />
  );
}

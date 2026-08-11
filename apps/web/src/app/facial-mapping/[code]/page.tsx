import { prisma } from '@doodle-dash/database';
import { FacialMappingClient } from '@/components/FacialMappingClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function FacialMappingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const character = await prisma.character.findUnique({ where: { internalCode: code } });
  if (!character) notFound();
  return (
    <FacialMappingClient
      characterId={character.id}
      characterCode={character.internalCode}
      characterName={character.name}
    />
  );
}

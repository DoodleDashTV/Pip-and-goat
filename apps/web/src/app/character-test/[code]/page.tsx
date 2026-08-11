import { prisma } from '@doodle-dash/database';
import { CharacterTestClient } from '@/components/CharacterTestClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function CharacterTestPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const character = await prisma.character.findUnique({ where: { internalCode: code } });
  if (!character) notFound();
  return (
    <CharacterTestClient
      characterId={character.id}
      characterCode={character.internalCode}
      characterName={character.name}
    />
  );
}

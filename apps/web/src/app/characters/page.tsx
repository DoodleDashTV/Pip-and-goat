import Link from 'next/link';
import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function CharactersPage() {
  const characters = await prisma.character.findMany({
    include: {
      models: true,
      versions: { orderBy: { versionNumber: 'asc' } },
      personalityDna: true,
    },
    orderBy: [{ foundingCharacter: 'desc' }, { name: 'asc' }],
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Characters</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Character Registry</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Permanent IDs, versioned designs, and DNA layers. Models stay MISSING until real assets
          land.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {characters.map((character) => (
          <Link
            key={character.id}
            href={`/characters/${character.internalCode}`}
            className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6 transition hover:border-leaf-400/40"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sun-400">
                  {character.internalCode}
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold">{character.name}</h2>
              </div>
              {character.foundingCharacter ? (
                <span className="rounded-full bg-leaf-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-leaf-300">
                  Founding
                </span>
              ) : null}
            </div>
            <p className="mt-4 text-sm text-[var(--muted)]">{character.biography}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-ink-900 px-3 py-1 text-mist-200">
                v{character.versions[character.versions.length - 1]?.versionNumber ?? 1}
              </span>
              <span className="rounded-full bg-ink-900 px-3 py-1 text-sun-300">
                Model: {character.models[0]?.status ?? 'MISSING'}
              </span>
              <span className="rounded-full bg-ink-900 px-3 py-1 text-leaf-300">
                Curiosity {character.personalityDna?.curiosity ?? '—'}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

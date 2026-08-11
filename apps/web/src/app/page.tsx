import Link from 'next/link';
import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [universe, characters, missingAssets, lockedCanon] = await Promise.all([
    prisma.universe.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } }),
    prisma.character.findMany({
      where: { foundingCharacter: true },
      include: { models: true },
      orderBy: { internalCode: 'asc' },
    }),
    prisma.asset.count({ where: { missing: true } }),
    prisma.canonFact.count({ where: { locked: true } }),
  ]);

  return (
    <div className="space-y-8">
      <header className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-8 shadow-studio backdrop-blur-md md:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Milestone 1</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-mist-100 md:text-5xl">
          {universe?.brandName ?? 'Doodle Dash TV'} Studio
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--muted)] md:text-lg">
          {universe?.description ??
            'Build connected seasons with permanent characters, locations, and reusable 3D assets.'}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/characters"
            className="rounded-2xl bg-leaf-500 px-5 py-3 text-sm font-extrabold text-ink-950 transition hover:bg-leaf-400"
          >
            Open Characters
          </Link>
          <Link
            href="/universe"
            className="rounded-2xl border border-leaf-400/40 px-5 py-3 text-sm font-bold text-leaf-300 transition hover:bg-leaf-500/10"
          >
            Universe Bible
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Universe', value: universe?.name ?? '—' },
          { label: 'Founding cast', value: String(characters.length) },
          { label: 'Locked canon', value: String(lockedCanon) },
          { label: 'Missing assets', value: String(missingAssets) },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-3xl border border-[var(--line)] bg-ink-800/70 p-5 backdrop-blur"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              {card.label}
            </p>
            <p className="mt-3 font-display text-2xl font-semibold text-mist-100">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {characters.map((character) => {
          const model = character.models[0];
          return (
            <Link
              key={character.id}
              href={`/characters/${character.internalCode}`}
              className="group rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6 transition hover:border-leaf-400/50 hover:bg-ink-800/80"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-sun-400">
                    {character.internalCode}
                  </p>
                  <h2 className="mt-2 font-display text-3xl font-bold">{character.name}</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {character.role ?? 'Founding character'}
                  </p>
                </div>
                <span className="rounded-full bg-sun-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sun-300">
                  {model?.status ?? 'MISSING'}
                </span>
              </div>
              <p className="mt-5 text-sm text-mist-200/80">
                Production model is marked MISSING until a real tested Blender asset is uploaded.
              </p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

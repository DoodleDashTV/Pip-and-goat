import { prisma } from '@doodle-dash/database';
import { resolveStudioDisplayName } from '@doodle-dash/domain';

export const dynamic = 'force-dynamic';

export default async function UniversePage() {
  const universe = await prisma.universe.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    include: {
      characters: {
        where: { foundingCharacter: true },
        orderBy: { internalCode: 'asc' },
      },
      _count: { select: { canonFacts: true, assets: true, characters: true } },
    },
  });

  if (!universe) {
    return <p className="text-[var(--muted)]">No universe seeded yet.</p>;
  }

  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-8 shadow-studio">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Universe</p>
        <h1 className="mt-3 font-display text-4xl font-bold">{universe.name}</h1>
        <p className="mt-2 text-leaf-300">{resolveStudioDisplayName(universe.brandName)}</p>
        <p className="mt-4 max-w-3xl text-[var(--muted)]">{universe.worldDescription}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['Characters', universe._count.characters],
          ['Canon facts', universe._count.canonFacts],
          ['Assets', universe._count.assets],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-3xl border border-[var(--line)] bg-ink-800/70 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              {label}
            </p>
            <p className="mt-3 font-display text-3xl">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-2xl font-semibold">Production defaults</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-[var(--muted)]">Output format</dt>
            <dd className="mt-1 font-semibold">{universe.defaultOutputFormat}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Audience</dt>
            <dd className="mt-1 font-semibold">{universe.targetAudience}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Status</dt>
            <dd className="mt-1 font-semibold">{universe.status}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Founding cast</dt>
            <dd className="mt-1 font-semibold">
              {universe.characters.map((c) => c.name).join(' · ')}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

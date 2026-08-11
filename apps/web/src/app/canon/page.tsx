import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function CanonPage() {
  const universe = await prisma.universe.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });

  const facts = universe
    ? await prisma.canonFact.findMany({
        where: { universeId: universe.id },
        orderBy: [{ locked: 'desc' }, { importance: 'desc' }, { createdAt: 'asc' }],
      })
    : [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Canon</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Universe Canon</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Locked and immutable facts cannot be silently changed by creative generation.
        </p>
      </header>

      <div className="space-y-3">
        {facts.map((fact) => (
          <article
            key={fact.id}
            className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
              <span className="rounded-full bg-ink-900 px-2.5 py-1 text-leaf-300">
                {fact.canonLevel}
              </span>
              <span className="rounded-full bg-ink-900 px-2.5 py-1 text-mist-200">
                {fact.category}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 ${
                  fact.locked
                    ? 'bg-sun-500/15 text-sun-300'
                    : 'bg-ink-900 text-[var(--muted)]'
                }`}
              >
                {fact.locked ? 'Locked' : 'Editable'}
              </span>
              <span className="rounded-full bg-ink-900 px-2.5 py-1 text-[var(--muted)]">
                importance {fact.importance}
              </span>
            </div>
            <p className="mt-3 text-base leading-relaxed text-mist-100">{fact.statement}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function ExpressionsPage() {
  const universe = await prisma.universe.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  const [expressions, visemes] = await Promise.all([
    universe
      ? prisma.expressionDefinition.findMany({
          where: { universeId: universe.id },
          orderBy: { code: 'asc' },
        })
      : Promise.resolve([]),
    prisma.visemeDefinition.findMany({ orderBy: { code: 'asc' } }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Library</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Expressions & Visemes</h1>
      </header>

      <section>
        <h2 className="font-display text-2xl font-semibold">Expressions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {expressions.map((expression) => (
            <article
              key={expression.id}
              className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl font-semibold">{expression.name}</h3>
                <span className="rounded-full bg-sun-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sun-300">
                  {expression.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-leaf-300">{expression.code}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold">Visemes</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {visemes.map((viseme) => (
            <span
              key={viseme.id}
              className="rounded-full border border-[var(--line)] bg-ink-800 px-4 py-2 text-sm font-semibold text-mist-100"
            >
              {viseme.code}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

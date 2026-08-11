import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function AnimationsPage() {
  const universe = await prisma.universe.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  const animations = universe
    ? await prisma.animationDefinition.findMany({
        where: { universeId: universe.id },
        orderBy: [{ category: 'asc' }, { code: 'asc' }],
      })
    : [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Library</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Animation Library</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Reusable animation definitions. Files are not fabricated — status stays MISSING until
          real clips are uploaded.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {animations.map((animation) => (
          <article
            key={animation.id}
            className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                  {animation.category}
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold">{animation.name}</h2>
                <p className="mt-1 text-sm text-leaf-300">{animation.code}</p>
              </div>
              <span className="rounded-full bg-sun-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sun-300">
                {animation.status}
              </span>
            </div>
            <p className="mt-4 text-sm text-[var(--muted)]">{animation.notes}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

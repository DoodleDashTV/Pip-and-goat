import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function PosesPage() {
  const universe = await prisma.universe.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  const poses = universe
    ? await prisma.poseDefinition.findMany({
        where: { universeId: universe.id },
        orderBy: { code: 'asc' },
      })
    : [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Library</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Pose Library</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Named reusable poses for storyboards and scene assembly.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {poses.map((pose) => (
          <article
            key={pose.id}
            className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">{pose.name}</h2>
              <span className="rounded-full bg-sun-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sun-300">
                {pose.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-leaf-300">{pose.code}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

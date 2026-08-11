import { prisma } from '@doodle-dash/database';
import { SEMANTIC_ANIMATION_CODES } from '@doodle-dash/domain';
import {
  costOptimizedWorkflowService,
  animationReuseEngine,
  proceduralCameraService,
} from '@doodle-dash/production';

export const dynamic = 'force-dynamic';

export default async function AnimationsPage() {
  const universe = await prisma.universe.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (universe) {
    await costOptimizedWorkflowService.bootstrap(universe.id);
  }
  const animations = universe
    ? await prisma.animationDefinition.findMany({
        where: { universeId: universe.id },
        orderBy: [{ category: 'asc' }, { code: 'asc' }],
      })
    : [];
  const metas = await prisma.animationLibraryMeta.findMany({ take: 200 });
  const metaByAnim = new Map(metas.map((m) => [m.animationDefinitionId, m]));
  const cameras = proceduralCameraService.listLanguage();
  const sampleDecision = universe
    ? await animationReuseEngine.decide({
        universeId: universe.id,
        semanticCode: 'WALK',
      })
    : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Library</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Animation Library</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Semantic slots ({SEMANTIC_ANIMATION_CODES.length}) for reuse: exact → retarget → modify →
          procedural composition → new native → optional AI. Files stay MISSING until real clips are
          uploaded — nothing is fabricated.
        </p>
        {sampleDecision ? (
          <p className="mt-2 text-sm text-leaf-300">
            Sample WALK decision: {sampleDecision.decision} ({sampleDecision.path.join(' → ')})
          </p>
        ) : null}
      </header>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-xl font-semibold">Procedural camera language (9:16)</h2>
        <p className="mt-2 flex flex-wrap gap-2 text-xs">
          {cameras.map((c) => (
            <span key={c.code} className="rounded-full bg-ink-950/50 px-2 py-1 text-sun-300">
              {c.code}
            </span>
          ))}
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {animations.map((animation) => {
          const meta = metaByAnim.get(animation.id);
          return (
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
              {meta ? (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  v{meta.version} · {meta.qualityStatus} · uses {meta.usageCount}
                  {meta.source ? ` · ${meta.source}` : ''}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

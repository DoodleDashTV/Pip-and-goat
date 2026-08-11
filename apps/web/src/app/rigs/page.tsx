import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function RigsPage() {
  const [rigs, facialRigs] = await Promise.all([
    prisma.characterRig.findMany({
      include: { character: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.characterFacialRig.findMany({
      include: { character: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Production</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Rig Registry</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Body and facial rigs for founding characters. None are approved until real assets exist.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {rigs.map((rig) => (
          <article
            key={rig.id}
            className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sun-400">
              {rig.character.internalCode}
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold">
              {rig.character.name} Rig {rig.rigVersion}
            </h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Skeleton: {rig.skeletonType ?? 'unspecified'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
              <Chip ok={rig.supportsFeet}>Feet</Chip>
              <Chip ok={rig.supportsHands}>Hands</Chip>
              <Chip ok={rig.supportsHead}>Head</Chip>
              <Chip ok={rig.supportsEyes}>Eyes</Chip>
              <Chip ok={rig.supportsSpine}>Spine</Chip>
              <Chip ok={rig.supportsEars}>Ears</Chip>
              <Chip ok={rig.supportsTail}>Tail</Chip>
            </div>
            <p className="mt-4 text-sm font-bold text-sun-300">
              {rig.status} · approved {String(rig.approved)}
            </p>
          </article>
        ))}
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold">Facial Rigs</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {facialRigs.map((rig) => (
            <article
              key={rig.id}
              className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6"
            >
              <h3 className="font-display text-xl font-semibold">
                {rig.character.name} Facial {rig.rigVersion}
              </h3>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Visemes planned: {Array.isArray(rig.visemes) ? rig.visemes.length : 0}
              </p>
              <p className="mt-2 text-sm font-bold text-sun-300">
                {rig.status} · approved {String(rig.approved)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 ${
        ok ? 'bg-leaf-500/15 text-leaf-300' : 'bg-ink-900 text-[var(--muted)]'
      }`}
    >
      {children}
    </span>
  );
}

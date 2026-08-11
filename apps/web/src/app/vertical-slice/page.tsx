import { prisma } from '@doodle-dash/database';
import { BuildEpisodeButton } from '@/components/BuildEpisodeButton';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const VERTICAL_SLICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

export default async function VerticalSlicePage() {
  const episode = await prisma.episode.findUnique({
    where: { id: VERTICAL_SLICE_ID },
    include: {
      season: true,
      storyboard: { include: { panels: true } },
      scenes: { include: { shots: true, location: true } },
      dialogues: true,
    },
  });

  const runs = await prisma.episodePipelineRun.findMany({
    where: { episodeId: VERTICAL_SLICE_ID },
    include: { stages: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (!episode) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold">Vertical Slice Missing</h1>
        <p className="text-[var(--muted)]">Run seed to create the internal production-test episode.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">
          Internal Production Test
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">{episode.title}</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">{episode.synopsis}</p>
        <p className="mt-2 text-sm text-sun-400">
          Not Season 1 public canon · Season: {episode.season?.title} · Status: {episode.status}
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/readiness" className="font-semibold text-leaf-300 underline">
            Readiness Dashboard
          </Link>
          <Link href="/asset-intake" className="font-semibold text-leaf-300 underline">
            Asset Intake
          </Link>
          <Link
            href="/episodes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/readiness"
            className="font-semibold text-leaf-300 underline"
          >
            Episode checklist + GENERATE FIRST DRAFT
          </Link>
          <Link
            href="/episodes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/shots"
            className="font-semibold text-leaf-300 underline"
          >
            Shot Inspector
          </Link>
        </div>
      </header>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-2xl font-bold">Exercises</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
          <li>Pip + Goat cast</li>
          <li>Location: {episode.scenes[0]?.location?.name ?? '—'}</li>
          <li>Prop plan: Adventure Map (PROP_MAP_001)</li>
          <li>Dialogue lines: {episode.dialogues.length}</li>
          <li>Shots: {episode.scenes.reduce((n, s) => n + s.shots.length, 0)}</li>
          <li>Storyboard panels: {episode.storyboard[0]?.panels.length ?? 0}</li>
          <li>Camera movement + character movement planned in shot descriptions</li>
          <li>Lip sync / music / SFX / captions planned — blocked until voices + assets</li>
        </ul>
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="mb-4 font-display text-2xl font-bold">BUILD EPISODE</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Does not bypass approvals. Stops at exact dependency boundaries (assets, voices, Blender).
        </p>
        <BuildEpisodeButton episodeId={episode.id} durationTargetSec={30} />
      </section>

      {runs.length ? (
        <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
          <h2 className="font-display text-2xl font-bold">Recent pipeline runs</h2>
          <ul className="mt-4 space-y-4">
            {runs.map((run) => (
              <li key={run.id} className="rounded-2xl bg-ink-950/40 p-4 text-sm">
                <p className="font-semibold">
                  {run.id.slice(0, 8)}… · {run.status} · {run.currentStage}
                </p>
                <ul className="mt-2 space-y-1 text-[var(--muted)]">
                  {run.stages.map((stage) => (
                    <li key={stage.id}>
                      {stage.stage}: {stage.status}
                      {stage.blockedReason ? ` — ${stage.blockedReason}` : ''}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

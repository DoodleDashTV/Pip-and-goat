import { prisma } from '@doodle-dash/database';
import { shotInspectorService } from '@doodle-dash/production';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EpisodeShotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const episode = await prisma.episode.findUnique({
    where: { id },
    include: { scenes: { include: { shots: true } } },
  });
  if (!episode) notFound();
  const shots = episode.scenes.flatMap((s) => s.shots);
  const inspections = [];
  for (const shot of shots) {
    inspections.push(await shotInspectorService.inspectShot(shot.id));
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Shot Inspector</p>
        <h1 className="mt-2 font-display text-4xl font-bold">{episode.title}</h1>
        <Link href={`/episodes/${id}/readiness`} className="mt-3 inline-block text-sm text-leaf-300 underline">
          Episode readiness
        </Link>
      </header>
      {inspections.map((ins) => (
        <section
          key={ins.shot.id}
          id={`shot-${ins.shot.number}`}
          className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6"
        >
          <h2 className="font-display text-2xl font-bold">
            Shot {String(ins.shot.number).padStart(2, '0')} · {ins.canAdvanceToNativeDraft ? 'READY' : 'BLOCKED'}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{ins.shot.description}</p>
          <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            <div>ID: {ins.shot.id}</div>
            <div>Scene: {ins.shot.sceneTitle}</div>
            <div>Duration: {ins.shot.durationSeconds}s</div>
            <div>Camera: {ins.shot.cameraPreset ?? '—'}</div>
            <div>Lighting: {ins.shot.lightingPreset ?? '—'}</div>
            <div>Render status: {ins.renderStatus}</div>
          </dl>
          <h3 className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-sun-400">VIEW BLOCKERS</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {ins.blockers.map((b) => (
              <li key={b.key} className="rounded-2xl bg-ink-950/40 px-4 py-3">
                <Link href={b.href} className="flex justify-between gap-3">
                  <span>{b.detail}</span>
                  <span className={b.state === 'ready' ? 'text-leaf-300' : 'text-rose-300'}>{b.state}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-rose-300">{ins.blockerSummary}</p>
        </section>
      ))}
    </div>
  );
}

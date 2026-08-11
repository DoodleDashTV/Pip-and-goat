import { doodleGuardian } from '@doodle-dash/production';
import { prisma } from '@doodle-dash/database';
import { DOODLE_GUARDIAN_THRESHOLD } from '@doodle-dash/domain';

export const dynamic = 'force-dynamic';

export default async function ContinuityPage() {
  const universe = await prisma.universe.findFirst({ where: { status: 'ACTIVE' } });
  const canonFacts = universe
    ? await prisma.canonFact.findMany({
        where: { universeId: universe.id },
        orderBy: { importance: 'desc' },
        take: 50,
      })
    : [];

  const report = doodleGuardian.score({
    text: 'Pip and Goat explore the meadow together while keeping founding canon intact.',
    canonFacts,
  });

  const missingModels = await prisma.character3dModel.count({
    where: { OR: [{ productionReady: false }, { status: { not: 'PRODUCTION_READY' } }] },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Continuity</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Doodle Guardian</h1>
      </header>
      <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <p className="font-display text-4xl text-leaf-300">{report.score}</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Threshold {report.threshold ?? DOODLE_GUARDIAN_THRESHOLD} · passed{' '}
          {String(report.passed)}
        </p>
        <p className="mt-4 text-sm text-sun-300">
          Character models not production-ready: {missingModels} (expected until real assets exist)
        </p>
        <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
          {report.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
          {report.conflicts.map((conflict) => (
            <li key={conflict.id ?? conflict.statement}>Conflict: {conflict.statement}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function DebugPage() {
  const [models, jobs, settings] = await Promise.all([
    prisma.character3dModel.findMany({ take: 10 }),
    prisma.renderJob.findMany({ take: 10, orderBy: { createdAt: 'desc' } }),
    prisma.studioSetting.findMany(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Debug</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Safe Debug</h1>
        <p className="mt-3 text-[var(--muted)]">No secrets are displayed.</p>
      </header>
      <pre className="overflow-auto rounded-[1.5rem] border border-[var(--line)] bg-ink-950/70 p-4 text-xs text-mist-200">
{JSON.stringify({ models, jobs, settings }, null, 2)}
      </pre>
    </div>
  );
}

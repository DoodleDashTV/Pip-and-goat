import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function Page() {
  
  const rows = await prisma.renderJob.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], take: 50 });
  const items = rows.map((row) => ({
    id: row.id,
    title: row.renderMode ?? row.resolution ?? 'Render job',
    subtitle: row.rationale ?? row.error ?? 'Queued production render',
    badge: `${row.status} · p${row.priority}`,
  }));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Render</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Render Queue</h1>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5">
            <h2 className="font-display text-xl font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{item.subtitle}</p>
            {item.badge ? (
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-sun-300">{item.badge}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

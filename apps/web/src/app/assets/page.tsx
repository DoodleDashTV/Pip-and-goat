import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function AssetsPage() {
  const assets = await prisma.asset.findMany({
    orderBy: [{ missing: 'desc' }, { createdAt: 'desc' }],
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Assets</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Asset Registry</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Metadata only in Postgres. Binary media belongs in durable object storage.
        </p>
      </header>

      <div className="overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-950/50 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3 font-semibold">{asset.name}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{asset.type}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      asset.missing
                        ? 'bg-sun-500/15 text-sun-300'
                        : 'bg-leaf-500/15 text-leaf-300'
                    }`}
                  >
                    {asset.missing ? 'MISSING' : 'Present'}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{asset.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

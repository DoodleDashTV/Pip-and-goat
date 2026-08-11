import { prisma } from '@doodle-dash/database';
import { productionReadinessService } from '@doodle-dash/production';
import { universeService } from '@doodle-dash/universe';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const STATE_COLOR: Record<string, string> = {
  READY: 'text-leaf-300',
  WARNING: 'text-sun-400',
  BLOCKED: 'text-rose-300',
  NOT_CONFIGURED: 'text-mist-200/70',
};

export default async function ReadinessPage() {
  const universe = await universeService.getPrimaryUniverse();
  const rows = universe
    ? await productionReadinessService.snapshotUniverse(universe.id)
    : [];

  const byEntity = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byEntity.get(row.entityKey) ?? [];
    list.push(row);
    byEntity.set(row.entityKey, list);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">
          Production Readiness
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">Dashboard</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Honest READY / WARNING / BLOCKED / NOT CONFIGURED status. Missing assets are never
          invented.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/asset-intake" className="text-sm font-semibold text-leaf-300 underline">
            Asset Intake
          </Link>
          <Link href="/vertical-slice" className="text-sm font-semibold text-leaf-300 underline">
            First Episode Vertical Slice
          </Link>
          <Link href="/voices" className="text-sm font-semibold text-leaf-300 underline">
            Voice Setup
          </Link>
        </div>
      </header>

      {[...byEntity.entries()].map(([entity, items]) => (
        <section
          key={entity}
          className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6"
        >
          <h2 className="font-display text-2xl font-bold">{entity}</h2>
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li key={`${item.area}-${item.entityKey}-${item.reason}`} className="text-sm">
                <span className="font-semibold text-mist-100">{item.area}</span>:{' '}
                <span className={STATE_COLOR[item.state] ?? ''}>{item.state}</span>
                <p className="text-[var(--muted)]">{item.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!rows.length ? (
        <p className="text-[var(--muted)]">No readiness snapshot yet.</p>
      ) : null}

      <p className="text-xs text-[var(--muted)]">
        Snapshots persisted:{' '}
        {universe
          ? await prisma.productionReadinessSnapshot.count({ where: { universeId: universe.id } })
          : 0}
      </p>
    </div>
  );
}

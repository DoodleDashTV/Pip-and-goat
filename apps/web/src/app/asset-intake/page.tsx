import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';

export const dynamic = 'force-dynamic';

export default async function AssetIntakePage() {
  const characters = await prisma.character.findMany({
    where: { internalCode: { in: [FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT] } },
    orderBy: { internalCode: 'asc' },
  });
  const intakes = await prisma.productionAssetIntake.findMany({
    orderBy: [{ entityType: 'asc' }, { kind: 'asc' }],
    take: 300,
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Phase 1</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Production Asset Intake</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Register real .blend / .glb / textures / rigs / references. Empty slots show{' '}
          <strong className="text-rose-300">PRODUCTION ASSET REQUIRED</strong> — no fake Pip or
          Goat models.
        </p>
      </header>

      {characters.map((character) => {
        const rows = intakes.filter(
          (i) => i.entityType === 'character' && i.entityId === character.id,
        );
        return (
          <section
            key={character.id}
            className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6"
          >
            <h2 className="font-display text-2xl font-bold">
              {character.name}{' '}
              <span className="text-base text-[var(--muted)]">{character.internalCode}</span>
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-ink-950/40 px-4 py-3"
                >
                  <span className="font-semibold">{row.kind}</span>
                  <span
                    className={
                      row.approvalStatus === 'MISSING' || !row.storageLocation
                        ? 'text-rose-300'
                        : 'text-leaf-300'
                    }
                  >
                    {row.approvalStatus === 'MISSING' || !row.storageLocation
                      ? 'PRODUCTION ASSET REQUIRED'
                      : `${row.approvalStatus} · v${row.version}`}
                  </span>
                  {row.missingReason ? (
                    <p className="w-full text-[var(--muted)]">{row.missingReason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-2xl font-bold">Locations</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {intakes
            .filter((i) => i.entityType === 'location')
            .map((row) => (
              <li key={row.id} className="rounded-2xl bg-ink-950/40 px-4 py-3">
                <span className="font-semibold">{row.kind}</span> ·{' '}
                <span className="text-rose-300">
                  {row.storageLocation ? row.approvalStatus : 'PRODUCTION ASSET REQUIRED'}
                </span>
                {row.missingReason ? (
                  <p className="text-[var(--muted)]">{row.missingReason}</p>
                ) : null}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

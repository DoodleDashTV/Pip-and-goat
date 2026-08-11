import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function ReferencesPage() {
  const references = await prisma.characterReferenceImage.findMany({
    include: { character: true },
    orderBy: [{ reviewStatus: 'asc' }, { createdAt: 'asc' }],
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">References</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Reference Image Registry</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Conflicting references stay in review state. The system will not auto-pick a look.
        </p>
      </header>

      <div className="space-y-3">
        {references.map((reference) => (
          <article
            key={reference.id}
            className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
              <span className="rounded-full bg-ink-900 px-2.5 py-1 text-leaf-300">
                {reference.character.internalCode}
              </span>
              <span className="rounded-full bg-sun-500/15 px-2.5 py-1 text-sun-300">
                {reference.reviewStatus}
              </span>
              {reference.isPrimary ? (
                <span className="rounded-full bg-leaf-500/15 px-2.5 py-1 text-leaf-300">
                  Primary slot
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold">{reference.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{reference.notes}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

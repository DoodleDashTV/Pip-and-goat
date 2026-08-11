import { prisma } from '@doodle-dash/database';

export const dynamic = 'force-dynamic';

export default async function RelationshipsPage() {
  const relationships = await prisma.characterRelationship.findMany({
    include: { fromCharacter: true, toCharacter: true },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Continuity</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Relationships</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Persistent social graph. Changes require a story event reference.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {relationships.map((relationship) => (
          <article
            key={relationship.id}
            className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sun-400">
              {relationship.fromCharacter.internalCode} → {relationship.toCharacter.internalCode}
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold">
              {relationship.fromCharacter.name} & {relationship.toCharacter.name}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{relationship.notes}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ['trust', relationship.trust],
                  ['friendship', relationship.friendship],
                  ['respect', relationship.respect],
                  ['dependence', relationship.dependence],
                  ['tension', relationship.tension],
                  ['rivalry', relationship.rivalry],
                  ['familiarity', relationship.familiarity],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="rounded-xl bg-ink-950/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{key}</p>
                  <p className="font-bold text-leaf-300">{value}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

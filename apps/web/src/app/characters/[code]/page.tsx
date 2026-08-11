import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@doodle-dash/database';
import { characterPreflightService } from '@doodle-dash/characters';

export const dynamic = 'force-dynamic';

export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const character = await prisma.character.findUnique({
    where: { internalCode: code },
    include: {
      versions: { orderBy: { versionNumber: 'asc' } },
      models: { include: { rig: true, facialRig: true } },
      rigs: true,
      facialRigs: true,
      referenceImages: { orderBy: { createdAt: 'asc' } },
      visualDna: true,
      personalityDna: true,
      motionDna: true,
      voiceDna: true,
      storyDna: true,
      development: true,
      developmentEvents: { orderBy: { createdAt: 'desc' }, take: 8 },
      relationshipsFrom: { include: { toCharacter: true } },
      relationshipsTo: { include: { fromCharacter: true } },
    },
  });

  if (!character) notFound();

  const model = character.models[0];
  const preflight = await characterPreflightService.runForCharacter(character.id);

  return (
    <div className="space-y-6">
      <Link href="/characters" className="text-sm font-semibold text-leaf-300">
        ← Characters
      </Link>

      <header className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-8 shadow-studio">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">
              {character.internalCode}
            </p>
            <h1 className="mt-3 font-display text-5xl font-bold">{character.name}</h1>
            <p className="mt-3 text-[var(--muted)]">{character.role}</p>
          </div>
          <div className="rounded-3xl border border-sun-400/30 bg-sun-500/10 px-4 py-3 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sun-300">
              3D Model
            </p>
            <p className="mt-1 font-display text-2xl text-sun-300">{model?.status ?? 'MISSING'}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              productionReady: {String(model?.productionReady ?? false)}
            </p>
          </div>
        </div>
        <p className="mt-6 max-w-3xl text-mist-200/90">{character.biography}</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.75rem] border border-[var(--line)] bg-ink-800/70 p-6">
          <h2 className="font-display text-2xl font-semibold">3D Viewer</h2>
          <div className="mt-4 flex aspect-[4/5] items-center justify-center rounded-[1.5rem] border border-dashed border-leaf-400/30 bg-ink-950/60">
            <div className="px-6 text-center">
              <p className="font-display text-xl text-leaf-300">No .glb available</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Browser preview activates after an approved glTF asset is registered. Master format
                remains Blender .blend.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Panel title="Native Render Preflight">
            <p className="text-sm font-semibold">
              STRICT_CHARACTER_LOCK:{' '}
              <span className="text-sun-300">{String(preflight.strictCharacterLock)}</span>
            </p>
            <p className="mt-2 text-sm">
              Status:{' '}
              <span className={preflight.blocked ? 'text-sun-300' : 'text-leaf-300'}>
                {preflight.blocked ? 'BLOCKED' : 'CLEAR'}
              </span>
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              {preflight.issues.map((issue) => (
                <li key={issue.code}>
                  [{issue.severity}] {issue.message}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Versions">
            <ul className="space-y-3">
              {character.versions.map((version) => (
                <li key={version.id} className="rounded-2xl bg-ink-950/50 px-4 py-3">
                  <p className="font-semibold">
                    {version.versionName}{' '}
                    <span className="text-[var(--muted)]">#{version.versionNumber}</span>
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {version.changeSummary ?? 'No summary'}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-sun-300">
                    approved: {String(version.approved)}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Voice DNA">
            <p className="text-sm text-[var(--muted)]">
              {character.voiceDna?.voiceProfile ?? 'Voice slot pending'}
            </p>
            <p className="mt-2 text-xs text-sun-300">
              Provider voice ID intentionally unset until approved.
            </p>
          </Panel>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Panel title="Body Rig">
          {character.rigs[0] ? (
            <>
              <p className="text-sm font-semibold">{character.rigs[0].rigVersion}</p>
              <p className="mt-2 text-sm text-sun-300">{character.rigs[0].status}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                approved: {String(character.rigs[0].approved)}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Missing</p>
          )}
        </Panel>
        <Panel title="Facial Rig">
          {character.facialRigs[0] ? (
            <>
              <p className="text-sm font-semibold">{character.facialRigs[0].rigVersion}</p>
              <p className="mt-2 text-sm text-sun-300">{character.facialRigs[0].status}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                approved: {String(character.facialRigs[0].approved)}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Missing</p>
          )}
        </Panel>
        <Panel title="References">
          <ul className="space-y-2 text-sm">
            {character.referenceImages.map((reference) => (
              <li key={reference.id}>
                {reference.title}{' '}
                <span className="text-sun-300">({reference.reviewStatus})</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Panel title="Development">
          {character.development ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries({
                confidence: character.development.confidence,
                courage: character.development.courage,
                patience: character.development.patience,
                empathy: character.development.empathy,
                leadership: character.development.leadership,
                independence: character.development.independence,
                curiosity: character.development.curiosity,
                responsibility: character.development.responsibility,
              }).map(([key, value]) => (
                <div key={key} className="rounded-xl bg-ink-950/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{key}</p>
                  <p className="font-bold text-leaf-300">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Not seeded</p>
          )}
          <ul className="mt-4 space-y-2 text-xs text-[var(--muted)]">
            {character.developmentEvents.map((event) => (
              <li key={event.id}>
                {event.attribute} {event.previousValue}→{event.newValue} · {event.storyEventRef}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Relationships">
          <ul className="space-y-3 text-sm">
            {character.relationshipsFrom.map((relationship) => (
              <li key={relationship.id} className="rounded-2xl bg-ink-950/40 px-4 py-3">
                → {relationship.toCharacter.name} · friendship {relationship.friendship} · trust{' '}
                {relationship.trust}
              </li>
            ))}
            {character.relationshipsTo.map((relationship) => (
              <li key={relationship.id} className="rounded-2xl bg-ink-950/40 px-4 py-3">
                ← {relationship.fromCharacter.name} · friendship {relationship.friendship} · trust{' '}
                {relationship.trust}
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Panel title="Personality DNA">
          {character.personalityDna ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries({
                friendliness: character.personalityDna.friendliness,
                confidence: character.personalityDna.confidence,
                bravery: character.personalityDna.bravery,
                curiosity: character.personalityDna.curiosity,
                patience: character.personalityDna.patience,
                energy: character.personalityDna.energy,
                empathy: character.personalityDna.empathy,
                leadership: character.personalityDna.leadership,
                independence: character.personalityDna.independence,
                impulsiveness: character.personalityDna.impulsiveness,
                humor: character.personalityDna.humor,
              }).map(([key, value]) => (
                <div key={key} className="rounded-xl bg-ink-950/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{key}</p>
                  <p className="font-bold text-leaf-300">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Not seeded</p>
          )}
        </Panel>

        <Panel title="Story DNA">
          <dl className="space-y-3 text-sm">
            {[
              ['Core desire', character.storyDna?.coreDesire],
              ['Main fear', character.storyDna?.mainFear],
              ['Long-term goal', character.storyDna?.longTermGoal],
              ['Growth', character.storyDna?.growthDirection],
              ['Weakness', character.storyDna?.weakness],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-[var(--muted)]">{label}</dt>
                <dd className="mt-1 font-semibold">{value ?? 'Pending review'}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Visual DNA">
          <p className="text-sm text-[var(--muted)]">
            {character.visualDna?.visualRestrictions ??
              'Visual identity pending approved references.'}
          </p>
          <p className="mt-3 text-xs uppercase tracking-wider text-sun-300">
            pendingReview: {String(character.visualDna?.pendingReview ?? true)}
          </p>
        </Panel>

        <Panel title="Motion DNA">
          <p className="text-sm text-[var(--muted)]">
            Motion styles are placeholders until animation library assets exist.
          </p>
          <p className="mt-3 text-xs uppercase tracking-wider text-sun-300">
            pendingReview: {String(character.motionDna?.pendingReview ?? true)}
          </p>
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

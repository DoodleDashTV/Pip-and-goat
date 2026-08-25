import Link from 'next/link';
import { Ep001RigHandoffMatrix } from '@/components/preview/Ep001RigHandoffMatrix';
import { Ep001ReviewWorksheet } from '@/components/preview/Ep001ReviewWorksheet';
import { compileEp001ProductionPackage } from '@/lib/tivvlejoy-ep001-production-package/compile';
import { compileEp001RigHandoffMatrix } from '@/lib/tivvlejoy-ep001-rig-handoff';

export const metadata = {
  title: 'Episode 1 Review | TivvleJoy',
  description: 'Read-only production review for Meadow Map Mystery.',
};

const formatToken = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const formatFrameTime = (frame: number, fps: number) => {
  const seconds = frame / fps;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
};

export default function EpisodeOnePage() {
  const episode = compileEp001ProductionPackage();
  const rigHandoff = compileEp001RigHandoffMatrix(episode);
  const dialogueByShot = new Map<string, typeof episode.dialogue>();

  for (const line of episode.dialogue) {
    const lines = dialogueByShot.get(line.shotId) ?? [];
    lines.push(line);
    dialogueByShot.set(line.shotId, lines);
  }

  const safetyChecks = [
    {
      label: 'Paid compute',
      value: episode.safety.gpuLaunched ? 'Started' : 'Not started',
    },
    {
      label: 'Voice provider',
      value: episode.safety.voiceProviderContacted ? 'Contacted' : 'Not contacted',
    },
    {
      label: 'Storage writes',
      value:
        episode.safety.sourceStorageMutations + episode.safety.productionStorageMutations === 0
          ? 'None'
          : 'Detected',
    },
    {
      label: 'Theatrical gate',
      value: episode.safety.theatricalGateOpened ? 'Open' : 'Closed',
    },
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Episode 1 review
            </p>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
              Draft · waiting for character rigs
            </span>
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
            {episode.workingTitle}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            A complete, read-only production plan for review while Pip and Goat are being finished.
            Nothing on this page launches a render, contacts a voice provider, or writes to
            Production.
          </p>
          <nav
            aria-label="Episode review sections"
            className="mt-4 flex flex-wrap gap-2 text-sm font-bold"
          >
            {[
              ['#story', 'Story'],
              ['#timeline', 'Shot timeline'],
              ['#dialogue', 'Dialogue'],
              ['#worksheet', 'Review worksheet'],
              ['#rig-handoff', 'Rig handoff'],
              ['#readiness', 'Readiness'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="inline-flex min-h-touch items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
          {[
            ['Runtime', `${episode.format.durationSeconds} seconds`],
            ['Format', `${episode.format.aspectRatio} · ${episode.format.fps} fps`],
            ['Shots', `${episode.shots.length}`],
            ['Dialogue', `${episode.dialogue.length} lines`],
          ].map(([label, value]) => (
            <div key={label} className="bg-[var(--color-surface)] p-4">
              <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                {label}
              </dt>
              <dd className="mt-1 font-display text-lg font-bold text-[var(--color-text)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="story" className="studio-card scroll-mt-6 p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Story
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          The whole minute at a glance
        </h2>
        <p className="mt-3 text-base leading-7 text-[var(--color-text)]">{episode.story.logline}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ['Hook', episode.story.hook],
            ['Complication', episode.story.complication],
            ['Payoff', episode.story.payoff],
            ['Final button', episode.story.button],
          ].map(([label, value]) => (
            <article
              key={label}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"
            >
              <h3 className="text-sm font-bold text-[var(--color-primary)]">{label}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{value}</p>
            </article>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-[var(--color-highlight)] bg-[var(--color-highlight-soft)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-highlight-foreground)]">
            Theme
          </p>
          <p className="mt-1 text-sm font-bold leading-6 text-[var(--color-highlight-foreground)]">
            {episode.story.theme}
          </p>
        </div>
      </section>

      <section id="timeline" className="studio-card scroll-mt-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Shot timeline
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              10 planned shots · no timeline gaps
            </h2>
          </div>
          <p className="text-sm font-bold text-[var(--color-text-muted)]">
            {episode.format.totalFrames.toLocaleString()} frames
          </p>
        </div>

        <ol className="mt-5 space-y-4">
          {episode.shots.map((shot, index) => {
            const shotDialogue = dialogueByShot.get(shot.shotId) ?? [];
            return (
              <li
                key={shot.shotId}
                className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-bold text-[var(--color-primary-foreground)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-[var(--color-text-muted)]">
                        {shot.shotId}
                      </p>
                      <h3 className="mt-1 font-display text-lg font-bold text-[var(--color-text)]">
                        {formatToken(shot.beat)}
                      </h3>
                    </div>
                  </div>
                  <p className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-[var(--color-text)]">
                    {formatFrameTime(shot.inFrame, episode.format.fps)}–
                    {formatFrameTime(shot.outFrame, episode.format.fps)}
                  </p>
                </div>

                <p className="mt-4 text-sm font-bold leading-6 text-[var(--color-text)]">
                  {shot.action}
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                  {shot.storyPurpose}
                </p>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['Scene', `${formatToken(shot.locationId)} · ${formatToken(shot.worldNode)}`],
                    [
                      'Camera',
                      `${formatToken(shot.shotIntent)} · ${formatToken(shot.cameraMotion)}`,
                    ],
                    ['Lighting', formatToken(shot.lightingIntent)],
                    ['Cast', shot.charactersVisible.map(formatToken).join(' + ')],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                        {label}
                      </dt>
                      <dd className="mt-1 leading-5 text-[var(--color-text)]">{value}</dd>
                    </div>
                  ))}
                </dl>

                {shotDialogue.length > 0 ? (
                  <div className="mt-4 space-y-2 rounded-2xl border border-[var(--color-highlight)] bg-[var(--color-highlight-soft)] p-3">
                    {shotDialogue.map((line) => (
                      <p
                        key={line.lineId}
                        className="text-sm leading-6 text-[var(--color-highlight-foreground)]"
                      >
                        <span className="font-bold">{formatToken(line.speaker)}:</span>{' '}
                        <q>{line.text}</q>
                      </p>
                    ))}
                  </div>
                ) : null}

                <details className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                  <summary className="min-h-touch cursor-pointer py-3 text-sm font-bold text-[var(--color-text)]">
                    Performance and continuity notes
                  </summary>
                  <div className="space-y-3 border-t border-[var(--color-border)] py-3 text-sm leading-6 text-[var(--color-text-muted)]">
                    {Object.entries(shot.performance).map(([character, cue]) => (
                      <p key={character}>
                        <span className="font-bold text-[var(--color-text)]">
                          {formatToken(character)}:
                        </span>{' '}
                        {cue?.gesture}; {cue?.storyGoal}.
                      </p>
                    ))}
                    <ul className="list-disc space-y-1 pl-5">
                      {shot.continuity.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </section>

      <section id="dialogue" className="studio-card scroll-mt-6 p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Dialogue review
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Script is timed; voice audio is not bound
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          These eight lines are ready for human story review. No voice service has been contacted.
        </p>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          {episode.dialogue.map((line, index) => (
            <li
              key={line.lineId}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"
            >
              <div className="flex items-center justify-between gap-3 text-xs font-bold text-[var(--color-text-muted)]">
                <span>
                  {index + 1}. {formatToken(line.speaker)}
                </span>
                <span>
                  {formatFrameTime(line.startFrame, episode.format.fps)}–
                  {formatFrameTime(line.endFrame, episode.format.fps)}
                </span>
              </div>
              <p className="mt-2 text-base font-bold leading-6 text-[var(--color-text)]">
                <q>{line.text}</q>
              </p>
              <p className="mt-2 text-sm leading-5 text-[var(--color-text-muted)]">
                {line.delivery}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <Ep001ReviewWorksheet
        packageSha256={episode.packageSha256}
        workingTitle={episode.workingTitle}
      />

      <Ep001RigHandoffMatrix matrix={rigHandoff} />

      <section id="readiness" className="studio-card scroll-mt-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Readiness
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Planning complete · execution blocked
            </h2>
          </div>
          <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
            {formatToken(episode.readiness.state)}
          </span>
        </div>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {episode.readiness.blockers.map((blocker) => (
            <li
              key={blocker.code}
              className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-6 text-[var(--color-warning-foreground)]"
            >
              {blocker.label}
            </li>
          ))}
        </ul>

        <h3 className="mt-6 font-display text-lg font-bold text-[var(--color-text)]">
          Safety remains locked
        </h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {safetyChecks.map((check) => (
            <div
              key={check.label}
              className="rounded-2xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-3"
            >
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-success-foreground)]">
                {check.label}
              </dt>
              <dd className="mt-1 text-sm font-bold text-[var(--color-success-foreground)]">
                {check.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link href="/rig-arrival" className="btn-primary px-4 text-sm">
            Open rig arrival
          </Link>
          <Link
            href="/episode-preflight"
            className="inline-flex min-h-touch items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-bold"
          >
            Open episode preflight
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 text-xs leading-5 text-[var(--color-text-muted)]">
        <p>
          Draft package fingerprint:{' '}
          <code className="break-all font-mono text-[var(--color-text)]">
            {episode.packageSha256}
          </code>
        </p>
        <p className="mt-1">Noncanonical · human approval required · no automatic approval</p>
      </section>
    </main>
  );
}

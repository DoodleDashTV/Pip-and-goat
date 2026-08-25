import Link from 'next/link';
import { compileEp001AudioCueSheet } from '@/lib/tivvlejoy-ep001-audio-cue-sheet';

export const metadata = {
  title: 'Episode 1 Audio Cue Sheet | TivvleJoy',
  description:
    'Read-only dialogue, sound-effects, ambience, and music plan for Meadow Map Mystery.',
};

const formatToken = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const formatTime = (seconds: number) => `${seconds.toFixed(2)}s`;

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--color-surface)] p-4">
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-display text-xl font-bold text-[var(--color-text)]">{value}</dd>
    </div>
  );
}

export default function EpisodeOneAudioPage() {
  const cueSheet = compileEp001AudioCueSheet();
  const dialogueById = new Map(cueSheet.dialogueCues.map((cue) => [cue.lineId, cue]));
  const sfxById = new Map(cueSheet.sfxCues.map((cue) => [cue.sfxEventId, cue]));
  const ambienceById = new Map(cueSheet.ambienceCues.map((cue) => [cue.ambienceCueId, cue]));
  const musicById = new Map(cueSheet.musicCues.map((cue) => [cue.cueId, cue]));

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link
            href="/episode-one"
            className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]"
          >
            ← Episode 1 review
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Episode 1 audio
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
                Dialogue and mix cue sheet
              </h1>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
              Real audio unbound
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            Exact frame-level instructions for dialogue, sound effects, ambience, music, and ducking
            across all 60 seconds of {cueSheet.workingTitle}. This page plans the mix without
            generating or importing audio.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <MetricCard label="Dialogue cues" value={cueSheet.metrics.dialogueCueCount} />
          <MetricCard label="Sound cues" value={cueSheet.metrics.sfxCueCount} />
          <MetricCard label="Ambience beds" value={cueSheet.metrics.ambienceCueCount} />
          <MetricCard label="Music cues" value={cueSheet.metrics.musicCueCount} />
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Voice lock
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Approved identities, zero generation
            </h2>
          </div>
          <span className="rounded-full border border-[var(--color-success)] bg-[var(--color-success-soft)] px-3 py-1 text-xs font-bold text-[var(--color-success-foreground)]">
            {cueSheet.voiceIdentity.checkpoint}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          The cue sheet binds each line to its approved public voice profile. Exact audio, timing,
          and approval receipts remain intentionally empty.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(['PIP', 'GOAT'] as const).map((speaker) => {
            const cues = cueSheet.dialogueCues.filter((cue) => cue.speaker === speaker);
            const first = cues[0]!;
            return (
              <article
                key={speaker}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"
              >
                <p className="font-display text-lg font-bold text-[var(--color-text)]">{speaker}</p>
                <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">
                  {first.characterId} · {first.voiceProfileVersion}
                </p>
                <p className="mt-3 text-sm font-bold text-[var(--color-primary)]">
                  {cues.length} lines · awaiting exact receipts
                </p>
              </article>
            );
          })}
        </div>

        <ol className="mt-5 space-y-3">
          {cueSheet.dialogueCues.map((cue) => (
            <li
              key={cue.lineId}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs font-bold text-[var(--color-text-muted)]">
                  {cue.lineId} · {cue.shotId}
                </p>
                <p className="text-xs font-bold text-[var(--color-primary)]">
                  {formatTime(cue.startSeconds)}–{formatTime(cue.endSeconds)} · frames{' '}
                  {cue.startFrame}–{cue.endFrame}
                </p>
              </div>
              <p className="mt-2 text-base font-bold leading-6 text-[var(--color-text)]">
                {cue.speaker}: <q>{cue.text}</q>
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                {cue.delivery}
              </p>
              <p className="mt-2 text-xs font-bold text-[var(--color-warning-foreground)]">
                {formatToken(cue.bindingState)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          60-second timeline
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Every shot has a complete logical mix row
        </h2>

        <ol className="mt-5 space-y-3">
          {cueSheet.shotMixRows.map((row) => {
            const ambience = ambienceById.get(row.ambienceCueId!);
            const music = musicById.get(row.musicCueId!);
            const dialogue = row.dialogueLineIds.map((id) => dialogueById.get(id)!);
            const sfx = row.sfxEventIds.map((id) => sfxById.get(id)!);
            return (
              <li key={row.shotId}>
                <details className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-2">
                  <summary className="min-h-touch cursor-pointer py-3">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--color-text)]">
                        {row.shotId}
                      </span>
                      <span className="text-xs font-bold text-[var(--color-primary)]">
                        {formatTime(row.startSeconds)}–{formatTime(row.endSeconds)} · {sfx.length}{' '}
                        SFX
                      </span>
                    </span>
                  </summary>

                  <div className="space-y-4 border-t border-[var(--color-border)] py-4">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                          Ambience
                        </dt>
                        <dd className="mt-1 text-[var(--color-text)]">
                          {ambience ? formatToken(ambience.layer) : 'Unbound'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                          Music
                        </dt>
                        <dd className="mt-1 text-[var(--color-text)]">
                          {music ? formatToken(music.role) : 'Unbound'} ·{' '}
                          {music ? formatToken(music.duckUnderDialogue) : 'No duck plan'}
                        </dd>
                      </div>
                    </dl>

                    {dialogue.length > 0 ? (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                          Dialogue
                        </p>
                        <ul className="mt-2 space-y-1 text-sm leading-6 text-[var(--color-text)]">
                          {dialogue.map((cue) => (
                            <li key={cue.lineId}>
                              {cue.speaker}: <q>{cue.text}</q>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                        Sound effects
                      </p>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--color-text-muted)]">
                        {sfx.map((cue) => (
                          <li key={cue.sfxEventId}>
                            <span className="font-mono font-bold text-[var(--color-text)]">
                              frame {cue.frame} · {cue.semanticType}
                            </span>{' '}
                            — {cue.syncTarget}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Mix target
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          Dialogue-first mobile master
        </h2>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              'Integrated loudness',
              `${cueSheet.mixTargets.integratedLufs} LUFS ±${cueSheet.mixTargets.integratedLufsTolerance}`,
            ],
            ['True peak ceiling', `${cueSheet.mixTargets.maxTruePeakDbtp} dBTP`],
            [
              'Master format',
              `${cueSheet.format.sampleRateHz / 1_000} kHz · ${cueSheet.format.bitDepth}-bit`,
            ],
            ['Playback review', 'Phone speaker + mono'],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3"
            >
              <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                {label}
              </dt>
              <dd className="mt-1 text-sm font-bold text-[var(--color-text)]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs font-bold text-[var(--color-warning-foreground)]">
          Targets only · no loudness measurement has been claimed
        </p>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Acceptance gates
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Real audio and human review still required
            </h2>
          </div>
          <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
            0 / {cueSheet.qualityGates.length} complete
          </span>
        </div>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {cueSheet.qualityGates.map((gate) => (
            <li
              key={gate.id}
              className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-6 text-[var(--color-warning-foreground)]"
            >
              {gate.label}
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-2xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4">
          <p className="text-sm font-bold text-[var(--color-success-foreground)]">
            Planning only · zero voice calls · zero audio bytes · zero paid requests · zero
            Production writes
          </p>
        </div>

        <p className="mt-5 text-xs leading-5 text-[var(--color-text-muted)]">
          Cue-sheet fingerprint:{' '}
          <code className="break-all font-mono text-[var(--color-text)]">
            {cueSheet.cueSheetSha256}
          </code>
        </p>
      </section>
    </main>
  );
}

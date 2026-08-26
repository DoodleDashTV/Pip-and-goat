import Link from 'next/link';
import { compileEp001StructuralAnimatic } from '@/lib/tivvlejoy-ep001-structural-animatic';

export const metadata = {
  title: 'Episode 1 Structural Animatic | TivvleJoy',
  description:
    'Read-only 60-second structural animatic plan for Meadow Map Mystery before real rigs and audio arrive.',
};

const formatToken = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const formatSeconds = (value: number) => `${value.toFixed(2)}s`;

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

export default function EpisodeOneAnimaticPage() {
  const animatic = compileEp001StructuralAnimatic();

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
                Episode 1 previz
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
                Structural animatic plan
              </h1>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
              Not character-quality approval media
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            Exact 60-second timing proof for all cuts, dialogue windows, pose counts, and sound
            markers. The local render uses color slates only, so it can test pacing without real
            rigs, scenery, voices, or paid compute.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <MetricCard label="Duration" value={`${animatic.renderContract.durationSeconds}s`} />
          <MetricCard label="Shot slates" value={animatic.metrics.slateCount} />
          <MetricCard label="Dialogue windows" value={animatic.metrics.dialogueWindowCount} />
          <MetricCard label="SFX markers" value={animatic.metrics.sfxMarkerCount} />
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Animatic timeline
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Ten contiguous timing slates
            </h2>
          </div>
          <p className="text-sm font-bold text-[var(--color-text-muted)]">
            {animatic.renderContract.width}×{animatic.renderContract.height} ·{' '}
            {animatic.renderContract.fps} fps
          </p>
        </div>

        <ol className="mt-5 space-y-3">
          {animatic.slates.map((slate) => (
            <li
              key={slate.slateId}
              className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-10 w-3 shrink-0 rounded-full border border-white/20"
                    style={{ backgroundColor: `#${slate.backgroundColor.slice(2)}` }}
                  />
                  <div>
                    <p className="font-mono text-xs font-bold text-[var(--color-text-muted)]">
                      {slate.shotId} · slate {slate.index}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold text-[var(--color-text)]">
                      {slate.title}
                    </h3>
                    <p className="mt-1 text-sm font-bold text-[var(--color-primary)]">
                      {formatToken(slate.beat)} · {formatToken(slate.transition)}
                    </p>
                  </div>
                </div>
                <p className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-[var(--color-text)]">
                  {formatSeconds(slate.startSeconds)}–{formatSeconds(slate.endSeconds)}
                </p>
              </div>

              <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
                {[
                  ['Frames', `${slate.inFrame}–${slate.outFrame}`],
                  ['Camera', formatToken(slate.cameraMotion)],
                  ['Pose cues', `${slate.poseCueCount}`],
                  ['Audio markers', `${slate.dialogueWindows.length + slate.sfxMarkers.length}`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[var(--color-surface)] p-3">
                    <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-[var(--color-text)]">{value}</dd>
                  </div>
                ))}
              </dl>

              {slate.dialogueWindows.length > 0 ? (
                <div className="space-y-2 border-t border-[var(--color-border)] p-4">
                  {slate.dialogueWindows.map((dialogue) => (
                    <p
                      key={dialogue.lineId}
                      className="rounded-2xl border border-[var(--color-highlight)] bg-[var(--color-highlight-soft)] p-3 text-sm leading-6 text-[var(--color-highlight-foreground)]"
                    >
                      <span className="font-bold">{dialogue.speaker}:</span> <q>{dialogue.text}</q>{' '}
                      <span className="whitespace-nowrap font-mono text-xs">
                        frames {dialogue.startFrame}–{dialogue.endFrame}
                      </span>
                    </p>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Structural proof gates
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Timing can pass without pretending the characters are finished
            </h2>
          </div>
          <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
            Human review still required
          </span>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {animatic.qualityGates.map((gate) => (
            <li
              key={gate.gateId}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-sm leading-6 text-[var(--color-text-muted)]"
            >
              <span className="font-mono text-xs font-bold text-[var(--color-primary)]">
                {gate.gateId}
              </span>
              <span className="mt-1 block">{gate.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Local structural render only</p>
        <p className="mt-1">
          Watermarked color slates · no real media · no audio · zero network calls · zero paid
          requests · zero remote storage or Production mutations
        </p>
      </section>
    </main>
  );
}

import Link from 'next/link';
import { compileEp001AnimationBlockingBoard } from '@/lib/tivvlejoy-ep001-animation-blocking-board';

export const metadata = {
  title: 'Episode 1 Animation Blocking | TivvleJoy',
  description:
    'Read-only stepped-pose, performance, contact, and dialogue blocking plan for Meadow Map Mystery.',
};

const formatToken = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

const formatTime = (frame: number, fps: number) => `${(frame / fps).toFixed(2)}s`;

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

export default function EpisodeOneAnimationPage() {
  const board = compileEp001AnimationBlockingBoard();

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
                Episode 1 animation
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
                Animation blocking board
              </h1>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
              Execution blocked
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            80 locked pose cues translate the approved 60-second story plan into an animator-ready
            stepped blocking pass. No rig is loaded, no keyframe is authored, and no voice timing is
            invented.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <MetricCard label="Shots" value={board.metrics.shotCount} />
          <MetricCard label="Character tracks" value={board.metrics.characterTrackCount} />
          <MetricCard label="Pose cues" value={board.metrics.poseCueCount} />
          <MetricCard label="Moving tracks" value={board.metrics.locomotionTrackCount} />
        </dl>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Blocking passes
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
          One safe order from stepped poses to playblast
        </h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          {board.executionPasses.map((pass, index) => (
            <li
              key={pass.passId}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"
            >
              <p className="font-mono text-xs font-bold text-[var(--color-primary)]">
                Pass {index + 1} · {pass.passId}
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--color-text)]">
                {pass.label}
              </p>
              <p className="mt-2 text-xs font-bold text-[var(--color-warning-foreground)]">
                {formatToken(pass.state)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              60-second blocking timeline
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Every character has four locked story poses per shot
            </h2>
          </div>
          <p className="text-sm font-bold text-[var(--color-text-muted)]">
            {board.format.totalFrames.toLocaleString()} frames · {board.format.fps} fps
          </p>
        </div>

        <ol className="mt-5 space-y-4">
          {board.shots.map((shot) => (
            <li key={shot.shotId}>
              <details className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-2 sm:px-5">
                <summary className="min-h-touch cursor-pointer py-3">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-mono text-xs font-bold text-[var(--color-text)]">
                        {shot.shotId}
                      </span>
                      <span className="ml-2 text-sm font-bold text-[var(--color-primary)]">
                        {formatToken(shot.beat)}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-[var(--color-text-muted)]">
                      {formatTime(shot.inFrame, board.format.fps)}–
                      {formatTime(shot.outFrame, board.format.fps)}
                    </span>
                  </span>
                </summary>

                <div className="space-y-5 border-t border-[var(--color-border)] py-4">
                  <div>
                    <p className="text-sm font-bold leading-6 text-[var(--color-text)]">
                      {shot.action}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                      {shot.storyPurpose}
                    </p>
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                        Camera
                      </dt>
                      <dd className="mt-1 leading-6 text-[var(--color-text)]">
                        {formatToken(shot.cameraTemplateId)} · {formatToken(shot.cameraMotion)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                        Audio sync
                      </dt>
                      <dd className="mt-1 leading-6 text-[var(--color-text)]">
                        {shot.dialogueCues.length} dialogue · {shot.sfxSyncCues.length} SFX markers
                      </dd>
                    </div>
                  </dl>

                  <div className="grid gap-3 lg:grid-cols-2">
                    {shot.characterTracks.map((track) => (
                      <article
                        key={track.characterId}
                        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-display text-lg font-bold text-[var(--color-text)]">
                              {track.characterId}
                            </h3>
                            <p className="mt-1 text-xs font-bold text-[var(--color-primary)]">
                              {formatToken(track.emotion)} · {formatToken(track.locomotion)}
                            </p>
                          </div>
                          <span className="rounded-full border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-2 py-1 text-[0.7rem] font-bold text-[var(--color-warning-foreground)]">
                            Rig unbound
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-bold leading-6 text-[var(--color-text)]">
                          {track.gesture}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                          {track.storyGoal}
                        </p>
                        <p className="mt-3 font-mono text-xs leading-5 text-[var(--color-text-muted)]">
                          {track.intendedActions.join(' · ')}
                        </p>

                        <ol className="mt-4 space-y-2">
                          {track.poseCues.map((pose) => (
                            <li
                              key={pose.poseId}
                              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-bold text-[var(--color-primary)]">
                                  Frame {pose.frame} · {formatTime(pose.frame, board.format.fps)}
                                </span>
                                <span className="text-[0.7rem] font-bold text-[var(--color-text-muted)]">
                                  {formatToken(pose.kind)}
                                </span>
                              </div>
                              <p className="mt-1 text-sm leading-5 text-[var(--color-text)]">
                                {pose.label}
                              </p>
                            </li>
                          ))}
                        </ol>
                      </article>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--color-highlight)] bg-[var(--color-highlight-soft)] p-3 text-sm leading-6 text-[var(--color-highlight-foreground)]">
                      <span className="font-bold">Contact:</span> {shot.interactionRule}
                    </div>
                    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm leading-6 text-[var(--color-text-muted)]">
                      <span className="font-bold text-[var(--color-text)]">Camera:</span>{' '}
                      {shot.cameraReadabilityRule}
                    </div>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Animation gates
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">
              Real rigs and voice timing still required
            </h2>
          </div>
          <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">
            0 of {board.qualityGates.length} passed
          </span>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {board.qualityGates.map((gate) => (
            <li
              key={gate.gateId}
              className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-6 text-[var(--color-warning-foreground)]"
            >
              <span className="font-mono text-xs font-bold">{gate.gateId}</span>
              <span className="mt-1 block">{gate.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Safe planning checkpoint</p>
        <p className="mt-1">
          Semantic blocking only · zero rig or audio bytes · zero network calls · zero paid requests
          · zero storage or Production writes
        </p>
      </section>
    </main>
  );
}

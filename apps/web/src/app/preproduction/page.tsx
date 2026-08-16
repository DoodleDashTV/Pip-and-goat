/**
 * Pre-Production — character-independent studio track.
 *
 * Phone-first control surface for story, continuity, storyboard, animatic,
 * 9:16 shot planning, reusable libraries, audio infrastructure, local
 * orchestration and the proxy output gate. Uses the bundled proxy fixture so
 * the page is useful without a database row or a paid provider.
 */
import { readProviderStatus } from '@doodle-dash/production';
import { STUDIO_DISPLAY_NAME } from '@doodle-dash/domain';
import {
  PROXY_PIPELINE_BRIEF,
  PROXY_WATERMARK,
  runPreproduction,
} from '@doodle-dash/preproduction';
import { currentStage as directionCurrentStage, evaluateTheatricalGate as directionTheatricalGate } from '@doodle-dash/direction';

export const dynamic = 'force-dynamic';

export default async function PreproductionPage() {
  const provider = readProviderStatus();
  const bundle = runPreproduction(PROXY_PIPELINE_BRIEF);
  const theatrical = directionTheatricalGate();
  const errors = bundle.issues.filter((issue) => issue.severity === 'ERROR');
  const warnings = bundle.issues.filter((issue) => issue.severity === 'WARNING');

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sun-400">
          {STUDIO_DISPLAY_NAME} · Pre-Production
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-mist-100 sm:text-4xl">
          Character-independent studio track
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Story, continuity, storyboard, animatic, 9:16 shot planning, reusable
          environments and VFX, and audio infrastructure — tested with labeled
          noncanonical proxies while Pip and Goat retopology is finished elsewhere.
        </p>
      </header>

      <section className="rounded-[1.5rem] border border-sun-400/40 bg-sun-500/10 p-5 text-sm text-mist-100">
        <h2 className="font-semibold">{PROXY_WATERMARK}</h2>
        <p className="mt-2 text-[var(--muted)]">
          This page runs the proxy pipeline fixture. Occupants are{' '}
          <span className="font-mono text-xs">{bundle.draft.occupants.join(', ')}</span>.
          They are not Pip or Goat. They cannot enter FINAL output, production-library,
          locked voices, or a story-approved ScenePlan.
        </p>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-mist-100">Gates still closed</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-leaf-300">Direction current stage</dt>
            <dd className="font-mono text-xs">{directionCurrentStage().id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Theatrical / Steps 9–16</dt>
            <dd className={theatrical.allowed ? 'text-sun-300' : 'text-leaf-300'}>
              {theatrical.allowed ? 'OPEN' : 'CLOSED'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Paid GPU</dt>
            <dd>{provider.requiresAuthorization ? 'not authorized' : 'authorized'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Proxy output gate</dt>
            <dd className={bundle.gate.allowed ? 'text-leaf-300' : 'text-sun-300'}>
              {bundle.gate.allowed ? 'DRAFT PATH OPEN' : 'BLOCKED'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-mist-100">
          {bundle.draft.title}
        </h2>
        <p className="mt-2 text-[var(--muted)]">{bundle.draft.logline}</p>
        <p className="mt-2 text-mist-100">Lesson: {bundle.draft.lesson}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-leaf-300">Output class</dt>
            <dd>{bundle.outputClass}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Technical</dt>
            <dd className={bundle.status === 'PASS' ? 'text-leaf-300' : 'text-sun-300'}>{bundle.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">ScenePlan emitted</dt>
            <dd>{bundle.scenePlan ? 'yes' : 'no'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Animatic</dt>
            <dd>
              {bundle.animatic.totalFrames} frames · {bundle.animatic.resolution} · {bundle.animatic.renderTier}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Shots</dt>
            <dd>
              {bundle.shotPlan.shots.length} · {bundle.shotPlan.aspect} · {bundle.shotPlan.deliveryResolution}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Issues</dt>
            <dd>
              {errors.length} errors · {warnings.length} warnings
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-mist-100">Beats</h2>
        <ol className="mt-3 space-y-3">
          {bundle.draft.beats.map((beat) => (
            <li key={beat.beatId} className="rounded-2xl border border-[var(--line)] p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-sun-300">
                {beat.purpose} · {beat.beatId}
              </p>
              <p className="mt-1 text-mist-100">{beat.summary}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-mist-100">QC</h2>
        <ul className="mt-3 space-y-2">
          {bundle.qc.checks.map((check) => (
            <li key={check.item} className="flex justify-between gap-3">
              <span className="font-mono text-xs">{check.item}</span>
              <span className={check.status === 'PASS' || check.status === 'NOT_APPLICABLE' ? 'text-leaf-300' : 'text-sun-300'}>
                {check.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}

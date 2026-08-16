/**
 * Episode Workflow — character-independent studio track (Milestone 5).
 *
 * Phone-first control surface for the BRIEF → OUTPUT_GATE walk. Uses the
 * bundled proxy fixture so the page is useful without a database row or a
 * paid provider. Terminals stop at pipeline-test complete; they cannot reach
 * FINAL_RENDER, THEATRICAL, or PUBLISHING.
 */
import { readProviderStatus } from '@doodle-dash/production';
import { STUDIO_DISPLAY_NAME } from '@doodle-dash/domain';
import {
  PROXY_PIPELINE_BRIEF,
  PROXY_WATERMARK,
  advanceWorkflow,
  buildEpisode1DraftPackage,
  planSteps9To16Infrastructure,
  planStudioCompletion25To32Infrastructure,
  summarizeWorkflow,
} from '@doodle-dash/preproduction';
import { StudioStatusPanel } from '@/components/StudioStatusPanel';
import { currentStage as directionCurrentStage, evaluateTheatricalGate as directionTheatricalGate } from '@doodle-dash/direction';

export const dynamic = 'force-dynamic';

export default async function WorkflowPage() {
  const provider = readProviderStatus();
  const run = advanceWorkflow(PROXY_PIPELINE_BRIEF);
  const summary = summarizeWorkflow(run);
  const theatrical = directionTheatricalGate();
  const episode1 = buildEpisode1DraftPackage();
  const closed = planSteps9To16Infrastructure();
  const completion = planStudioCompletion25To32Infrastructure();

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
          {STUDIO_DISPLAY_NAME} · Episode Workflow
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
          Character-independent production walk
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Advance a labeled proxy brief through story, continuity, storyboard,
          animatic, shots, library, audio, orchestration, QC, and the output
          gate. This is not a final render and not a theatrical bind.
        </p>
      </header>

      <StudioStatusPanel />

      <section className="studio-card border-[var(--color-highlight)] p-5 text-sm">
        <h2 className="font-semibold">{PROXY_WATERMARK}</h2>
        <p className="mt-2 text-[var(--muted)]">
          Occupants are <span className="font-mono text-xs">{summary.occupants.join(', ')}</span>.
          Terminal <span className="font-mono text-xs">{summary.terminal}</span>.
          Final / theatrical / publishing continue flags stay false.
        </p>
      </section>

      <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Gates still closed</h2>
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
            <dt className="text-xs uppercase text-leaf-300">May continue to final</dt>
            <dd>{summary.mayContinueToFinal ? 'yes' : 'no'}</dd>
          </div>
        </dl>
      </section>

      <section className="studio-card p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Stages</h2>
        <ol className="mt-3 space-y-2">
          {summary.stages.map((stage) => (
            <li key={stage.id} className="flex justify-between gap-3 rounded-2xl border border-[var(--line)] px-3 py-2">
              <span className="font-mono text-xs">
                {stage.id}
                {summary.currentStage === stage.id ? ' · current' : ''}
              </span>
              <span className={stage.status === 'DONE' ? 'status-success rounded-full px-2 py-0.5' : 'status-warning rounded-full px-2 py-0.5'}>
                {stage.status}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Draft Episode 1</h2>
        <p className="mt-2 text-[var(--muted)]">
          {episode1.label} · productionEligible={String(episode1.productionEligible)} ·
          canonical={String(episode1.canonical)}. Persistence for the proxy fixture is
          EPHEMERAL_TEST_ONLY unless a durable write is explicitly required.
        </p>
      </section>

      <section className="studio-card p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Steps 9–16</h2>
        <p className="mt-2 text-[var(--color-text-muted)]">
          Infrastructure is described only. Gate {closed.gateAllowed ? 'OPEN' : 'CLOSED'}. Stage{' '}
          {closed.currentStage}. Workstreams stay BLOCKED. This page does not open the gate.
        </p>
      </section>

      <section className="studio-card p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Steps 25–32</h2>
        <p className="mt-2 text-[var(--color-text-muted)]">
          Studio completion infrastructure is described only. Opened {String(completion.opened)}.
          Gate {completion.gateAllowed ? 'OPEN' : 'CLOSED'}. Stage {completion.currentStage}.
          Workstreams stay BLOCKED.
        </p>
      </section>

      <section className="studio-card p-5 text-sm">
        <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Readiness</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-leaf-300">QC technical</dt>
            <dd>{summary.qcTechnical}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">QC artistic</dt>
            <dd>{summary.qcArtistic}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Can launch final</dt>
            <dd>{summary.readiness.canLaunchFinal ? 'yes' : 'no'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-leaf-300">Can launch paid GPU</dt>
            <dd>{summary.readiness.canLaunchPaidGpu ? 'yes' : 'no'}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

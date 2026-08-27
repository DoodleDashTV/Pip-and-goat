import Link from 'next/link';
import { compileEp001ProductionGateway } from '@/lib/tivvlejoy-ep001-production-gateway';

export const metadata = {
  title: 'Episode 1 Production Gateway | TivvleJoy',
  description: 'Read-only critical-path overview from artist rig delivery through publishing and archive.',
};

const prettyState = (value: string) => value.toLowerCase().replaceAll('_', ' ');

export default function EpisodeOneProductionGatewayPage() {
  const gateway = compileEp001ProductionGateway();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Episode 1 review</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">TivvleJoy production control</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Episode 1 production gateway</h1></div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Waiting on artist rigs</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">One ordered view of the real critical path. Planning layers are prepared, but execution gates remain closed until the actual corrected character rigs arrive and pass exact SHA-bound inspection plus human approval.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Stages</p><p className="mt-1 font-display text-2xl font-bold">{gateway.summary.stageCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">External wait</p><p className="mt-1 font-display text-2xl font-bold">{gateway.summary.externalWaitingCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Prepared layers</p><p className="mt-1 font-display text-2xl font-bold">{gateway.summary.planOrTemplateReadyCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Paid authority</p><p className="mt-1 font-display text-lg font-bold">None</p></div>
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Current critical path</p>
        <h2 className="mt-2 font-display text-2xl font-bold">External character delivery is the physical blocker</h2>
        <div className="mt-4 rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
          <p className="font-bold">Required inputs</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{gateway.currentCriticalPath.requiredInputs.map((input) => <li key={input}>{input}</li>)}</ul>
          <p className="mt-3"><span className="font-bold">Then:</span> {gateway.currentCriticalPath.nextInternalActionAfterDelivery}</p>
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Ordered production chain</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Eight linked readiness layers</h2>
        <ol className="mt-4 space-y-3">
          {gateway.stages.map((stage, index) => (
            <li key={stage.stageId} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{index + 1}. {stage.stageId}</p><Link href={stage.route} className="mt-1 inline-block font-display text-lg font-bold text-[var(--color-text)] underline decoration-[var(--color-primary)]/40 underline-offset-4">{stage.label}</Link><p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{stage.readyDefinition}</p></div>
                <span className="max-w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold capitalize">{prettyState(stage.state)}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">When the artist files arrive</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Exact operator sequence</h2>
        <ol className="mt-4 space-y-2">{gateway.operatorSequence.map((item, index) => <li key={item} className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm leading-6"><span className="mr-2 font-bold text-[var(--color-primary)]">{index + 1}.</span>{item}</li>)}</ol>
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Gateway is informational only</p><p className="mt-1">No source bytes · Blender not launched · zero paid requests · zero storage/Production mutations · zero external posts · no automatic approval</p><p className="mt-3 break-all font-mono text-[11px]">Gateway sha256:{gateway.gatewaySha256}</p>
      </section>
    </main>
  );
}

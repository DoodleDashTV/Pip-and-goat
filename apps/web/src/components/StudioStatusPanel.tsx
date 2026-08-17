import { FOUNDATION_STAGE_LABEL } from '@/lib/preview-workspace/types';
import { readStudioDashboardStatus } from '@/lib/studio-status';

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'closed' | 'warning' | 'success';
}) {
  const toneClass =
    tone === 'success' ? 'status-success' : tone === 'warning' ? 'status-warning' : 'status-error';
  const icon = tone === 'success' ? '✓' : tone === 'warning' ? '!' : '×';
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-[var(--color-text)]">{label}</p>
      <p
        className={`inline-flex min-h-touch items-center gap-2 self-start rounded-full px-3 py-1 text-sm font-bold ${toneClass}`}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{value}</span>
      </p>
    </div>
  );
}

export function StudioStatusPanel() {
  const status = readStudioDashboardStatus();

  return (
    <section
      aria-labelledby="studio-condition-heading"
      className="studio-card space-y-4 p-5 sm:p-6"
      data-testid="studio-condition"
    >
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">
          Current studio condition
        </p>
        <h2 id="studio-condition-heading" className="mt-2 font-display text-2xl font-semibold">
          Truthful production status
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          These values come from the existing stage and gate interfaces. Closed work is labeled
          closed. No control here starts a paid job or opens a locked stage.
        </p>
      </header>
      <div className="grid gap-3">
        <StatusRow label="Stage" value={FOUNDATION_STAGE_LABEL} tone="closed" />
        <StatusRow
          label="Theatrical gate"
          value={status.theatricalGateLabel}
          tone={status.theatricalAllowed ? 'success' : 'closed'}
        />
        <StatusRow
          label="Steps 9–16"
          value={status.steps9to16Label}
          tone={status.steps9to16Opened ? 'warning' : 'closed'}
        />
        <StatusRow
          label="Steps 25–32"
          value={status.steps25to32Label}
          tone={status.steps25to32Opened ? 'warning' : 'closed'}
        />
        <StatusRow
          label="Episode 1"
          value={
            status.episode1Canonical || status.episode1ProductionReady
              ? `${status.episode1Label}`
              : 'Not canonical or production-ready'
          }
          tone="warning"
        />
        <StatusRow
          label="Paid resources"
          value={status.paidResourcesAuthorized ? 'Authorized' : 'Not authorized'}
          tone={status.paidResourcesAuthorized ? 'warning' : 'closed'}
        />
        <StatusRow
          label="Pip/Goat theatrical binding"
          value={status.theatricalBindingCompleted ? 'Completed' : 'Not completed'}
          tone={status.theatricalBindingCompleted ? 'success' : 'closed'}
        />
      </div>
      <details className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3">
        <summary className="flex min-h-touch cursor-pointer list-none items-center text-sm font-bold text-[var(--color-primary)]">
          Advanced / debug — technical values
        </summary>
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
          Technical tools, not the normal Preview workflow.
        </p>
        <p className="mt-2 break-all font-mono text-xs text-[var(--color-text)]">
          Technical stage: {status.stageId}
        </p>
      </details>
    </section>
  );
}

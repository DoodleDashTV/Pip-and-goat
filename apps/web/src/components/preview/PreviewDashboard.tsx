'use client';

import Link from 'next/link';
import { FOUNDATION_STAGE_LABEL } from '@/lib/preview-workspace/types';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { evaluatePreviewGuide, previewStepLabel } from '@/lib/preview-workspace/progress';
import type { SafePersistenceSnapshot } from '@/lib/persistence/types';
import { ConnectionReadinessPanel } from './ConnectionReadinessPanel';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';

const STATUS_CLASS: Record<string, string> = {
  completed: 'status-success',
  in_progress: 'status-warning',
  not_started: 'border border-[var(--color-border)] bg-[var(--color-surface-subtle)] text-[var(--color-text)]',
  blocked: 'status-error',
};

export function PreviewDashboard({ snapshot }: { snapshot: SafePersistenceSnapshot }) {
  const { workspace, hydrated, busy, message, reset, exportBackup, importBackup } =
    usePreviewWorkspace();
  const steps = evaluatePreviewGuide(workspace);
  const nextStep = steps.find((step) => step.status === 'not_started' || step.status === 'in_progress');

  return (
    <div className="space-y-4 overflow-x-hidden">
      <section className="studio-card p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
          Studio status
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
          TivvleJoy dashboard
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          Follow the seven steps below. This Preview workspace is available in this browser. It is
          not connected to production.
        </p>
        <dl className="mt-4 grid gap-3">
          <div className="rounded-2xl border border-[var(--color-success)] bg-[var(--color-success-soft)] px-3 py-3">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-success-foreground)]">
              Preview workspace
            </dt>
            <dd className="mt-1 text-sm font-bold text-[var(--color-success-foreground)]">Available</dd>
          </div>
          <div className="rounded-2xl border border-[var(--color-error)] bg-[var(--color-error-soft)] px-3 py-3">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-error-foreground)]">
              Preview database
            </dt>
            <dd className="mt-1 text-sm font-bold text-[var(--color-error-foreground)]">Not connected</dd>
          </div>
          <div className="rounded-2xl border border-[var(--color-error)] bg-[var(--color-error-soft)] px-3 py-3">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-error-foreground)]">
              Production database
            </dt>
            <dd className="mt-1 text-sm font-bold text-[var(--color-error-foreground)]">Not connected</dd>
          </div>
          <div className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-3">
            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-warning-foreground)]">
              Preview data
            </dt>
            <dd className="mt-1 text-sm font-bold leading-5 text-[var(--color-warning-foreground)]">
              Stored only in this browser and non-durable
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Stage: <span className="font-bold text-[var(--color-text)]">{FOUNDATION_STAGE_LABEL}</span>
          <span> · Gate closed</span>
        </p>
        {hydrated && nextStep ? (
          <Link href={nextStep.href} className="btn-primary mt-4 w-full px-4 text-sm sm:w-auto">
            Continue: {nextStep.title}
          </Link>
        ) : null}
      </section>
      <ConnectionReadinessPanel snapshot={snapshot} />
      <PreviewBanner
        busy={busy}
        onReset={() => reset()}
        onExport={() => exportBackup()}
        onImport={(text, byteLength, confirm) => importBackup(text, byteLength, confirm)}
      />
      <PreviewMessage message={message} />

      <section className="studio-card p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">
          Guided preview path
        </h2>
        <p className="mt-1 break-words text-sm leading-6 text-[var(--color-text-muted)]">
          Production Setup → New Episode → Assets → Voices → Episode Workflow → Readiness → Render
          Queue
        </p>
        {!hydrated ? (
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">
            Loading this browser&apos;s preview workspace…
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className="flex min-h-touch items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3 no-underline"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-sm font-bold text-[var(--color-text)]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[var(--color-text)]">{step.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CLASS[step.status]}`}
                      >
                        {previewStepLabel(step.status)}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-[var(--color-text-muted)]">
                      {step.instruction}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

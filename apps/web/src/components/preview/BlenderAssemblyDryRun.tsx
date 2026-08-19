'use client';

import { useMemo, useState } from 'react';
import { PreviewPageIntro } from './PreviewEmptyState';
import { dryRunEp012 } from '@/lib/tivvlejoy-blender-assembly-driver';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 break-all text-sm font-semibold">{value}</p>
    </div>
  );
}

export function BlenderAssemblyDryRun() {
  const report = useMemo(() => dryRunEp012(), []);
  const [shotId, setShotId] = useState(report.plans[1]?.shotId ?? report.plans[0]?.shotId ?? 'SH002');
  const [openScript, setOpenScript] = useState(false);
  const plan = report.plans.find((item) => item.shotId === shotId) ?? report.plans[0]!;

  return (
    <div className="space-y-4 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Blender Assembly Dry Run"
        title="TivvleJoy blender assembly dry run"
        instruction="Dry run only. Blender is not executed. Commercial assets are not read."
      />

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
          DRY RUN ONLY / BLENDER NOT EXECUTED / COMMERCIAL ASSETS NOT READ / BOTANIQ NOT PROCESSED / GPU NOT USED /
          EXECUTION AUTHORIZED = FALSE
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Generated Python is preview text only. No subprocess. No bpy execution. Production rigs stay unresolved.
        </p>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <Field label="Episode" value={`${report.episodeId} · ${report.title}`} />
        <Field label="Shot count" value={String(report.metrics.shotCount)} />
        <Field label="Dry-run valid with unresolved" value={String(report.metrics.dryRunValidWithUnresolved)} />
        <Field label="Execution authorized count" value={String(report.metrics.executionAuthorizedCount)} />
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Shots</h2>
        <div className="flex flex-wrap gap-2">
          {report.plans.map((item) => (
            <button
              key={item.shotId}
              type="button"
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                item.shotId === plan.shotId
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'border border-[var(--color-border)]'
              }`}
              onClick={() => setShotId(item.shotId)}
            >
              {item.shotId}
            </button>
          ))}
        </div>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <Field label="Shot" value={plan.shotId} />
        <Field label="Assembly manifest SHA" value={plan.assemblyDependencySha256} />
        <Field label="Plan SHA" value={plan.planDependencySha256} />
        <Field label="Script SHA" value={plan.script.scriptSha256} />
        <Field label="Operation count" value={String(plan.simulation.operationCount)} />
        <Field label="Collection count" value={String(plan.simulation.collectionCount)} />
        <Field label="Camera operations" value={String(plan.cameraPlan.length)} />
        <Field label="Lighting operations" value={String(plan.lightingPlan.length)} />
        <Field
          label="Character status"
          value={plan.characterPlan.map((item) => `${item.parameters.characterId}:${item.status}`).join(' · ')}
        />
        <Field
          label="Environment status"
          value={`${plan.simulation.unresolvedEnvironmentCount} unresolved · ${plan.environmentPlan.filter((item) => item.status === 'PLANNED').length} planned`}
        />
        <Field
          label="Blocked operations"
          value={String(plan.simulation.blockedOperations)}
        />
        <Field
          label="Script audit"
          value={plan.audit.safe ? 'safe=true' : `safe=false ${plan.audit.forbiddenTokensFound.join(',')}`}
        />
        <Field label="Dry-run result" value={plan.simulation.simulationResult} />
        <Field label="Execution authorization" value={`issued=${String(plan.authorization.issued)}`} />
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <button type="button" className="btn-primary px-4 text-sm" onClick={() => setOpenScript((value) => !value)}>
          {openScript ? 'Hide generated Python' : 'Show generated Python preview'}
        </button>
        {openScript ? (
          <pre className="max-h-[28rem] overflow-auto rounded-2xl bg-[var(--color-surface-subtle)] p-3 text-xs">
            {plan.script.source}
          </pre>
        ) : null}
      </section>
    </div>
  );
}

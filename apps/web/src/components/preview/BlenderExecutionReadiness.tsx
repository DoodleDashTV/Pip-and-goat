'use client';

import { useMemo, useState } from 'react';
import { PreviewPageIntro } from './PreviewEmptyState';
import { evaluateEp012Readiness } from '@/lib/tivvlejoy-blender-execution-readiness/fixtures';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 break-all text-sm font-semibold">{value}</p>
    </div>
  );
}

export function BlenderExecutionReadiness() {
  const report = useMemo(() => evaluateEp012Readiness(), []);
  const [shotId, setShotId] = useState(report.receipts[1]?.shotId ?? report.receipts[0]?.shotId ?? 'SH002');
  const receipt = report.receipts.find((item) => item.shotId === shotId) ?? report.receipts[0]!;
  const pip = receipt.characterResolutionSummary;
  const pipStatus = receipt.blockingReasons.find((item) => item.startsWith('PIP:')) ?? (receipt.readinessState.includes('RIG') ? 'blocked' : 'not required');
  const goatStatus = receipt.blockingReasons.find((item) => item.startsWith('GOAT:')) ?? 'not required';

  return (
    <div className="space-y-4 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Blender Execution Readiness"
        title="TivvleJoy blender execution readiness"
        instruction="Admission control only. No Blender execution. Authorization is not issued."
      />

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
          NO BLENDER EXECUTION / NO COMMERCIAL ASSET READ / NO GPU / AUTHORIZATION NOT ISSUED
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          EP012 can finish planning and dry-run. Real execution stays blocked until approved receipts and a later
          authorization exist. This gate fails closed.
        </p>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <Field label="Episode" value={`${report.episodeId} · ${report.title}`} />
        <Field label="Shot count" value={String(report.summary.shotCount)} />
        <Field label="Ready for authorization" value={String(report.summary.readyForAuthorizationCount)} />
        <Field label="Blocked shots" value={String(report.summary.blockedShotCount)} />
        <Field label="Authorization issued" value={String(report.summary.authorizationIssuedCount)} />
        <Field label="Blender executed" value={String(report.summary.blenderExecutedCount)} />
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Shots</h2>
        <div className="flex flex-wrap gap-2">
          {report.receipts.map((item) => (
            <button
              key={item.shotId}
              type="button"
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                item.shotId === receipt.shotId
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
        <Field label="Shot" value={receipt.shotId} />
        <Field
          label="Hash chain"
          value={receipt.hashChain.allExact ? 'exact' : `mismatch ${receipt.hashChain.mismatches.join(',')}`}
        />
        <Field label="Script audit" value={receipt.scriptSafety ? 'safe=true' : 'safe=false'} />
        <Field label="Assets" value={`${receipt.assetResolutionSummary.required} required · ${receipt.assetResolutionSummary.blocked} blocked`} />
        <Field label="Botaniq status" value={`executionReady=${String(receipt.botaniq.executionReady)}`} />
        <Field label="Pip status" value={pipStatus} />
        <Field label="Goat status" value={goatStatus} />
        <Field label="Materialization" value={receipt.readinessState === 'BLOCKED_MATERIALIZATION' ? 'not verified' : 'checked'} />
        <Field label="Blender version" value={`${receipt.blender.testedVersion} · ${receipt.blender.compatibility}`} />
        <Field label="Worker identity" value={receipt.worker.valid ? 'immutable digest valid' : 'blocked'} />
        <Field label="Readiness state" value={receipt.readinessState} />
        <Field label="Blocking reasons" value={receipt.blockingReasons.join(' · ') || 'none'} />
        <Field label="Authorization required" value={String(receipt.executionAuthorizationRequired)} />
        <Field label="Authorization issued" value={String(receipt.executionAuthorizationIssued)} />
        <Field label="Characters required" value={String(pip.required)} />
      </section>
    </div>
  );
}

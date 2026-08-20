'use client';

import Link from 'next/link';
import type { buildRigArrivalConsoleModel } from '@/lib/tivvlejoy-real-input-convergence/console-model';
import type { RigArrivalChecklistRow, RigHandoffFile } from '@/lib/tivvlejoy-real-production-unblock/types';

export function RigArrivalConsole({
  model,
  handoff,
  checklist,
}: {
  model: ReturnType<typeof buildRigArrivalConsoleModel>;
  handoff?: { pip: RigHandoffFile[]; goat: RigHandoffFile[] };
  checklist?: RigArrivalChecklistRow[];
}) {
  return (
    <section className="space-y-4">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Rig arrival</p>
        <h1 className="font-display text-2xl font-semibold">Drop-in rig intake</h1>
        <p className="text-sm font-bold">{model.banner}</p>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          No public upload of commercial rig bytes. Metadata intake hashes, stores immutably, and never auto-approves.
          Admission state: {model.admissionState}.
        </p>
        <p className="text-sm">
          <Link href="/episode-preflight" className="font-bold underline">
            Episode preflight
          </Link>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(['pip', 'goat'] as const).map((role) => (
          <div key={role} className="studio-card space-y-2 p-4 sm:p-5">
            <h2 className="font-display text-xl font-semibold">{role === 'pip' ? 'Pip' : 'Goat'} contract</h2>
            <p className="text-sm">Source present: {String(model[role].sourcePresent)}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {model[role].rows.map((row) => (
                <li key={row.step}>
                  {row.humanLabel} — {row.complete ? 'done' : 'waiting'}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {handoff ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(['pip', 'goat'] as const).map((role) => (
            <div key={`handoff-${role}`} className="studio-card space-y-2 p-4 sm:p-5">
              <h2 className="font-display text-xl font-semibold">{role === 'pip' ? 'Pip' : 'Goat'} upload list</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {handoff[role].map((file) => (
                  <li key={file.label}>
                    {file.label} — {file.required ? 'required' : 'only if needed'}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {checklist ? (
        <div className="studio-card space-y-2 p-4 sm:p-5">
          <h2 className="font-display text-xl font-semibold">Acceptance checklist</h2>
          <p className="text-sm text-[var(--color-text-muted)]">Printable operator list. Nothing auto-completes. No auto approval.</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {checklist.map((row) => (
              <li key={row.id}>
                {row.label} — waiting
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Required evidence</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {model.requiredFiles.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Synthetic playbook (cannot approve)</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          {model.pipPlaybook.map((row) => row.state).join(' → ')}
        </p>
        <p className="text-sm">Auto-approved: {String(model.pipPlaybook.some((row) => row.autoApproved))}</p>
      </div>
    </section>
  );
}

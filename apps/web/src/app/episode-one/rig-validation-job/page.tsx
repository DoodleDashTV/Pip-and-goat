import Link from 'next/link';
import { compileRigValidationJob } from '@/lib/tivvlejoy-rig-validation-job-contract';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Episode 1 Rig Validation Job | TivvleJoy',
  description: 'Fail-closed execution payload contract for future real-rig Blender validation.',
};

const PLACEHOLDER_VERSION = '00000000-0000-4000-8000-000000000000';
const PLACEHOLDER_SHA = '0'.repeat(64);

export default function Ep001RigValidationJobPage() {
  const pip = compileRigValidationJob({ characterId: 'CHAR_PIP_001', rigVersionId: PLACEHOLDER_VERSION, rigSourceSha256: PLACEHOLDER_SHA, rigReceiptSha256: PLACEHOLDER_SHA, adapterSha256: PLACEHOLDER_SHA });
  const goat = compileRigValidationJob({ characterId: 'CHAR_GOAT_001', rigVersionId: PLACEHOLDER_VERSION, rigSourceSha256: PLACEHOLDER_SHA, rigReceiptSha256: PLACEHOLDER_SHA, adapterSha256: PLACEHOLDER_SHA });
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card p-4 sm:p-6">
        <Link href="/episode-one/rig-animation-compatibility" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Compatibility suite</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 rig validation</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Future Blender validation job is already shaped</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">When the real rig receipt and control adapter exist, TivvleJoy can compile this same payload with the real hashes. The current template has zero worker-launch authority and a $0 GPU ceiling.</p>
      </section>

      {([['Pip', pip], ['Goat', goat]] as const).map(([label, job]) => (
        <section key={label} className="studio-card p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</p><h2 className="mt-1 font-display text-2xl font-bold">{job.payload.tests.length} planned validation tests</h2></div><span className="status-warning rounded-full px-3 py-1 text-xs font-bold">launch disabled</span></div>
          <dl className="mt-4 grid gap-px overflow-hidden rounded-xl bg-[var(--color-border)] sm:grid-cols-4">
            {[['Max wall clock', `${job.payload.limits.maxWallClockMinutes} min`], ['GPU spend ceiling', `$${job.payload.limits.maxGpuSpendUsd}`], ['Paid authorized', String(job.payload.limits.paidExecutionAuthorized)], ['Can approve rig', String(job.payload.authority.canApproveRig)]].map(([k,v]) => <div key={k} className="bg-[var(--color-surface)] p-3"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{k}</dt><dd className="mt-1 font-bold">{v}</dd></div>)}
          </dl>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b border-[var(--color-border)]"><th className="p-2">Test</th><th className="p-2">Frames</th><th className="p-2">Manifest output</th><th className="p-2">Playblast output</th></tr></thead><tbody>{job.payload.tests.map((test) => <tr key={test.testId} className="border-b border-[var(--color-border)]"><td className="p-2 font-mono text-xs">{test.testId}</td><td className="p-2">{test.durationFrames}</td><td className="p-2 break-all font-mono text-[11px]">{test.output.manifestKey}</td><td className="p-2 break-all font-mono text-[11px]">{test.output.playblastKey}</td></tr>)}</tbody></table></div>
          <p className="mt-4 break-all font-mono text-[11px] text-[var(--color-text-muted)]">Template job SHA-256: {job.jobSha256}</p>
        </section>
      ))}

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">This page cannot launch validation.</p>
        <p className="mt-1">Real rig/receipt/adapter hashes plus a separate explicit execution authorization are required before any worker or paid pod can be created.</p>
      </section>
    </main>
  );
}

import Link from 'next/link';
import { compileEp001SceneryDeepInspectionPlan } from '@/lib/tivvlejoy-ep001-scenery-deep-inspection-plan';

export const metadata = {
  title: 'Episode 1 Scenery Deep Inspection | TivvleJoy',
  description: 'Read-only execution manifest for isolated EP001 scenery inspection.',
};

export default function EpisodeOneSceneryDeepInspectionPage() {
  const plan = compileEp001SceneryDeepInspectionPlan();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/scenery-license-evidence" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Scenery license evidence</Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 isolated inspection</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Scenery deep-inspection execution plan</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">The inspection session is fully specified before Blender is allowed to open a purchased source. Originals stay immutable, evidence is SHA-bound, and technical success cannot issue license or visual approval.</p>
        </div>
        <dl className="grid gap-px bg-[var(--color-border)] sm:grid-cols-5">
          {[
            ['Sources', plan.metrics.sourceCount],
            ['Blender opens', plan.metrics.blenderOpenCount],
            ['FBX imports', plan.metrics.fbxImportCount],
            ['Texture static', plan.metrics.textureStaticCount],
            ['Executed', plan.metrics.executedCount],
          ].map(([label, value]) => <div key={String(label)} className="bg-[var(--color-surface)] p-4"><dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 font-display text-2xl font-bold">{value}</dd></div>)}
        </dl>
      </section>

      <section className="space-y-3">
        {plan.items.map((item) => (
          <article key={item.sourceId} className="studio-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="break-all font-mono text-xs font-bold text-[var(--color-primary)]">{item.sourceId}</p><p className="mt-1 text-xs font-bold text-[var(--color-text-muted)]">{item.inspectionMode} · {item.dependencyClass}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">NOT EXECUTED</span></div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Checks</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{item.checks.map((check) => <li key={check}>{check}</li>)}</ul>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Evidence outputs</p>
            <p className="mt-2 break-words font-mono text-xs">{item.expectedEvidence.join(' · ')}</p>
          </article>
        ))}
      </section>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Global execution rules</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{plan.globalExecutionRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        <h3 className="mt-6 font-display text-xl font-bold">Human visual review</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">{plan.requiredVisualReview.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
        <p className="font-bold">Execution is prepared, not authorized.</p>
        <p className="mt-1">Blender launched: no · paid compute: no · source modification: no · license approval: no · visual approval: no · Production writes: no.</p>
        <p className="mt-3 break-all font-mono text-[11px]">Scenery deep inspection plan sha256: {plan.sceneryDeepInspectionPlanSha256}</p>
      </section>
    </main>
  );
}

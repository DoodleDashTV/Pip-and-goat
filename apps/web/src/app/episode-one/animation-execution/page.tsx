import Link from 'next/link';
import { compileEp001AnimationExecutionManifest } from '@/lib/tivvlejoy-ep001-animation-execution-manifest';

export const metadata = {
  title: 'Episode 1 Animation Execution | TivvleJoy',
  description: 'Read-only 10-shot execution manifest for EP001 animation after exact rigs are admitted.',
};

export default function Ep001AnimationExecutionPage() {
  const manifest = compileEp001AnimationExecutionManifest();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/animation-release" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Animation release gate</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 production</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Animation execution manifest</h1></div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Execution blocked · manifest ready</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">Turns the locked 1,800-frame episode into ten exact shot tasks. Once Pip and Goat pass rig admission, these tasks can move directly through blocking, contact, facial performance, spline polish, secondary motion, continuity QA, and human playblast approval.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Shots</p><p className="mt-1 font-display text-2xl font-bold">{manifest.metrics.shotTaskCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Passes / shot</p><p className="mt-1 font-display text-2xl font-bold">{manifest.metrics.executionPassCountPerShot}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Planned passes</p><p className="mt-1 font-display text-2xl font-bold">{manifest.metrics.totalPlannedShotPasses}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Approved shots</p><p className="mt-1 font-display text-2xl font-bold">0 / 10</p></div>
        </div>
      </section>

      <section className="space-y-3">{manifest.shotTasks.map((shot) => (
        <article key={shot.shotId} className="studio-card p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{shot.shotId} · frames {shot.frameRange.inFrame}–{shot.frameRange.outFrame}</p><h2 className="mt-1 font-display text-xl font-bold">{shot.beat}</h2><p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{shot.action}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">BLOCKED</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Visible characters</p><p className="mt-1 text-sm font-semibold">{shot.visibleCharacters.join(' + ')}</p></div><div className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Dialogue</p><p className="mt-1 text-sm font-semibold">{shot.dialogueLineIds.length ? shot.dialogueLineIds.join(', ') : 'No dialogue'}</p></div></div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2">{shot.executionPasses.map((pass) => <li key={pass.passId} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-sm"><span className="font-mono text-xs font-bold text-[var(--color-primary)]">{pass.passId}</span><p className="mt-1">{pass.label}</p></li>)}</ol>
        </article>
      ))}</section>

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Execution rules</p><ul className="mt-4 grid gap-2 sm:grid-cols-2">{manifest.globalExecutionRules.map((rule) => <li key={rule} className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]">{rule}</li>)}</ul></section>
      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]"><p className="font-bold">Execution plan only</p><p className="mt-1">No rig/audio/animation bytes · Blender not launched · zero keyframes · zero paid requests · zero Production mutations</p><p className="mt-3 break-all font-mono text-[11px]">Execution manifest sha256:{manifest.executionManifestSha256}</p></section>
    </main>
  );
}

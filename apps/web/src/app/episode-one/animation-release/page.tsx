import Link from 'next/link';
import { compileEp001AnimationReleaseGate } from '@/lib/tivvlejoy-ep001-animation-release-gate';

export const metadata = {
  title: 'Episode 1 Animation Release | TivvleJoy',
  description: 'Read-only release gate between approved character rigs and EP001 animation execution.',
};

export default function EpisodeOneAnimationReleasePage() {
  const gate = compileEp001AnimationReleaseGate();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/rig-review" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">
            ← Rig review worksheet
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 animation handoff</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Animation release gate</h1>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Animation blocked</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            This gate prevents stepped blocking, facial timing, playblasts, animation bake, or paid execution from starting until the exact approved rigs and required evidence are admitted.
          </p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Release gates</p><p className="mt-1 font-display text-2xl font-bold">{gate.gates.length}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Characters</p><p className="mt-1 font-display text-2xl font-bold">{gate.rigRequirements.length}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Frames</p><p className="mt-1 font-display text-2xl font-bold">{gate.format.totalFrames}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">FPS</p><p className="mt-1 font-display text-2xl font-bold">{gate.format.fps}</p></div>
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Rig dependencies</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Both exact rig versions must clear review</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {gate.rigRequirements.map((character) => (
            <article key={character.characterId} className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
              <p className="text-xs font-bold text-[var(--color-primary)]">{character.characterId}</p>
              <h3 className="mt-1 font-display text-xl font-bold">{character.displayName}</h3>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{character.requiredCheckCount} blocking checks · {character.requiredPoseCount} required poses</p>
              <p className="mt-3 text-sm font-bold">{character.releaseState}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Release requirements</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Eight gates before animation may start</h2>
        <ol className="mt-4 space-y-3">
          {gate.gates.map((item) => (
            <li key={item.gateId} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{item.gateId}</p><p className="mt-1 text-sm leading-6">{item.label}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold">{item.state}</span></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Planned passes</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Execution remains staged but locked</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {gate.plannedExecutionPasses.map((pass) => <li key={pass.passId} className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{pass.passId}</p><p className="mt-1 text-sm font-semibold">{pass.label}</p><p className="mt-2 text-xs text-[var(--color-text-muted)]">{pass.releaseState}</p></li>)}
        </ul>
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Release definition only</p>
        <p className="mt-1">Zero rig bytes · zero audio bytes · Blender not launched · zero keyframes · zero paid requests · zero Production mutations · no auto-approval</p>
        <p className="mt-3 break-all font-mono text-[11px]">Release gate sha256:{gate.releaseGateSha256}</p>
      </section>
    </main>
  );
}

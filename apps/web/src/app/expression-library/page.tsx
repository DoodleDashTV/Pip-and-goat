import Link from 'next/link';
import { compileCharacterExpressionPoseLibrary } from '@/lib/tivvlejoy-character-expression-pose-library';

export const metadata = {
  title: 'Character Expression Library | TivvleJoy',
  description: 'Read-only reusable expression and dialogue-pose contract for admitted TivvleJoy rigs.',
};

export default function CharacterExpressionLibraryPage() {
  const library = compileCharacterExpressionPoseLibrary();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/motion-library" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Character motion library</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Reusable facial performance</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Character expression library</h1></div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Specification ready · poses not authored</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">Defines reusable expressions, gaze/blink states, and abstract dialogue mouth shapes. Real control bindings are recorded only after the exact Pip and Goat rigs are inspected and admitted.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Characters</p><p className="mt-1 font-display text-2xl font-bold">{library.metrics.characterCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Expressions each</p><p className="mt-1 font-display text-2xl font-bold">{library.metrics.expressionSpecCountPerCharacter}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Dialogue shapes each</p><p className="mt-1 font-display text-2xl font-bold">{library.metrics.dialogueShapeSpecCountPerCharacter}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Approved poses</p><p className="mt-1 font-display text-2xl font-bold">0</p></div>
        </div>
      </section>

      {library.characters.map((character) => (
        <section key={character.characterId} className="studio-card p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{character.characterId}</p><h2 className="mt-1 font-display text-2xl font-bold">{character.displayName}</h2></div><p className="text-sm font-bold text-[var(--color-text-muted)]">Exact rig SHA: not recorded</p></div>
          <h3 className="mt-5 font-display text-xl font-bold">Expression poses</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{character.expressions.map((pose) => <article key={pose.poseId} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{pose.poseId}</p><p className="mt-1 text-sm leading-6">{pose.purpose}</p><p className="mt-2 text-xs text-[var(--color-text-muted)]">{pose.reviewState}</p></article>)}</div>
          <h3 className="mt-6 font-display text-xl font-bold">Dialogue shapes</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{character.dialogueShapes.map((shape) => <article key={shape.shapeId} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{shape.shapeId}</p><p className="mt-1 text-sm leading-6">{shape.purpose}</p><p className="mt-2 text-xs text-[var(--color-text-muted)]">Control binding: not recorded</p></article>)}</div>
        </section>
      ))}

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Fail-closed binding rules</p><ul className="mt-4 grid gap-2 sm:grid-cols-2">{library.bindingRules.map((rule) => <li key={rule} className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]">{rule}</li>)}</ul></section>
      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]"><p className="font-bold">Expression specification only</p><p className="mt-1">No rig/audio/pose bytes · Blender not launched · zero keyframes · zero paid requests · zero storage/Production mutations</p><p className="mt-3 break-all font-mono text-[11px]">Expression library sha256:{library.expressionPoseLibrarySha256}</p></section>
    </main>
  );
}

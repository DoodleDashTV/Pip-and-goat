import Link from 'next/link';
import { compileEp001RigReviewWorksheet } from '@/lib/tivvlejoy-ep001-rig-review-worksheet';

export const metadata = {
  title: 'Episode 1 Rig Review Worksheet | TivvleJoy',
  description: 'Read-only SHA-bound review worksheet template for incoming Pip and Goat rigs.',
};

const formatToken = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

export default function EpisodeOneRigReviewPage() {
  const worksheet = compileEp001RigReviewWorksheet();

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/rig-inspection" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">
            ← Rig inspection protocol
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 artist handoff</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">Rig review worksheet</h1>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Waiting for artist delivery</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
            A read-only template for recording every required inspection result after the real artist files arrive. Nothing on this page approves a rig, launches Blender, or unlocks animation.
          </p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Characters</p><p className="mt-1 font-display text-2xl font-bold">{worksheet.characters.length}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Pip checks</p><p className="mt-1 font-display text-2xl font-bold">{worksheet.characters.find((c) => c.characterId === 'PIP')?.rows.length}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Goat checks</p><p className="mt-1 font-display text-2xl font-bold">{worksheet.characters.find((c) => c.characterId === 'GOAT')?.rows.length}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Approval</p><p className="mt-1 font-display text-lg font-bold">Manual only</p></div>
        </div>
      </section>

      {worksheet.characters.map((character) => (
        <section key={character.characterId} className="studio-card p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">{character.characterId}</p>
              <h2 className="mt-1 font-display text-2xl font-bold">{character.displayName}</h2>
            </div>
            <span className="status-warning rounded-full px-3 py-1 text-xs font-bold">{formatToken(character.state)}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="text-xs font-bold text-[var(--color-text-muted)]">Source SHA-256</p><p className="mt-1 text-sm font-semibold">Not recorded</p></div>
            <div className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="text-xs font-bold text-[var(--color-text-muted)]">Blocking checks</p><p className="mt-1 font-display text-xl font-bold">{character.rows.length}</p></div>
            <div className="rounded-2xl bg-[var(--color-surface-subtle)] p-4"><p className="text-xs font-bold text-[var(--color-text-muted)]">Required poses</p><p className="mt-1 font-display text-xl font-bold">{character.requiredTestPoses.length}</p></div>
          </div>
          <ol className="mt-5 space-y-3">
            {character.rows.map((row) => (
              <li key={row.checkId} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{row.checkId} · {formatToken(row.stage)}</p><h3 className="mt-1 font-display text-lg font-bold">{row.label}</h3></div>
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-bold">Not reviewed</span>
                </div>
                <p className="mt-3 text-sm leading-6">{row.acceptanceCriterion}</p>
                <p className="mt-2 font-mono text-xs text-[var(--color-text-muted)]">Evidence: {row.evidenceKind}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="studio-card p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Completion rules</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Fail closed until real evidence exists</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {worksheet.completionRules.map((rule) => <li key={rule} className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]">{rule}</li>)}
        </ul>
      </section>

      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]">
        <p className="font-bold">Worksheet template only</p>
        <p className="mt-1">Zero rig bytes · Blender not launched · zero paid requests · zero storage or Production mutations · no automatic approval</p>
        <p className="mt-3 break-all font-mono text-[11px]">Worksheet sha256:{worksheet.worksheetSha256}</p>
      </section>
    </main>
  );
}

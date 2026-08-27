import Link from 'next/link';
import { compileEp001VoiceExecutionReadiness } from '@/lib/tivvlejoy-ep001-voice-execution-readiness';

export const metadata = {
  title: 'Episode 1 Voice Execution Readiness | TivvleJoy',
  description: 'Read-only exact eight-line voice execution packet for EP001.',
};

export default function Ep001VoiceExecutionReadinessPage() {
  const packet = compileEp001VoiceExecutionReadiness();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 sm:p-6">
          <Link href="/episode-one/audio" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Episode 1 audio cue sheet</Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 voice production</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Voice execution readiness</h1></div><span className="status-warning rounded-full px-3 py-1 text-xs font-bold">Packet ready · real audio absent</span></div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">All eight locked dialogue lines are prepared with exact picture windows, approved voice-profile bindings, and immutable receipt slots. This page does not call the voice provider.</p>
        </div>
        <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Lines</p><p className="mt-1 font-display text-2xl font-bold">{packet.metrics.lineCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Pip lines</p><p className="mt-1 font-display text-2xl font-bold">{packet.metrics.pipLineCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Goat lines</p><p className="mt-1 font-display text-2xl font-bold">{packet.metrics.goatLineCount}</p></div>
          <div className="bg-[var(--color-surface)] p-4"><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Approved</p><p className="mt-1 font-display text-2xl font-bold">0 / 8</p></div>
        </div>
      </section>

      <section className="space-y-3">{packet.lines.map((line) => <article key={line.lineId} className="studio-card p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-[var(--color-primary)]">{line.lineId} · {line.speaker} · {line.shotId}</p><p className="mt-2 text-base font-semibold">“{line.text}”</p><p className="mt-2 text-sm text-[var(--color-text-muted)]">{line.delivery}</p></div><span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-1 text-xs font-bold">NOT_GENERATED</span></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm">frames {line.pictureWindow.startFrame}–{line.pictureWindow.endFrame}</div><div className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm">audio SHA: not recorded</div><div className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm">timing receipt: not recorded</div></div></article>)}</section>

      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Exact execution order</p><ol className="mt-4 space-y-2">{packet.executionOrder.map((step, index) => <li key={step} className="rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm"><span className="mr-2 font-mono font-bold text-[var(--color-primary)]">{String(index + 1).padStart(2, '0')}</span>{step}</li>)}</ol></section>
      <section className="studio-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Fail-closed rules</p><ul className="mt-4 grid gap-2 sm:grid-cols-2">{packet.failureRules.map((rule) => <li key={rule} className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-sm leading-5 text-[var(--color-warning-foreground)]">{rule}</li>)}</ul></section>
      <section className="rounded-3xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm leading-6 text-[var(--color-success-foreground)]"><p className="font-bold">Execution packet only</p><p className="mt-1">No provider calls · no audio bytes · zero paid requests · zero storage/Production mutations · no automatic approval</p><p className="mt-3 break-all font-mono text-[11px]">Voice readiness sha256:{packet.voiceExecutionReadinessSha256}</p></section>
    </main>
  );
}

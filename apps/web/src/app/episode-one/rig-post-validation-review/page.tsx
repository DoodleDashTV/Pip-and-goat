import Link from 'next/link';
import { Ep001RigPostValidationReviewPreparer } from '@/components/preview/Ep001RigPostValidationReviewPreparer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Episode 1 Rig Human Review | TivvleJoy', description: 'SHA-bound post-validation human review preparation for Pip and Goat.' };

export default function Ep001RigPostValidationReviewPage() {
  return <main className="mx-auto min-h-screen w-full max-w-7xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
    <section className="studio-card p-4 sm:p-6">
      <Link href="/episode-one/rig-validation-result" className="inline-flex min-h-touch items-center text-sm font-bold text-[var(--color-primary)]">← Validation result contract</Link>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 rig human gate</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Technical pass flows into exact human review</h1>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">This screen binds the exact source rig, upload receipt, control adapter, validation job/result, deformation media and inspection evidence into one immutable review subject. A reviewer must still explicitly approve or reject it.</p>
    </section>
    <div className="grid gap-4 xl:grid-cols-2"><Ep001RigPostValidationReviewPreparer characterId="CHAR_PIP_001" /><Ep001RigPostValidationReviewPreparer characterId="CHAR_GOAT_001" /></div>
    <section className="rounded-3xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]"><p className="font-bold">Technical clean does not equal approved.</p><p className="mt-1">Human likeness, deformation, animation quality, prop interaction and accessory stability review remains mandatory before Episode 1 rig admission.</p></section>
  </main>;
}

import Link from 'next/link';
import { Ep001RigDeliveryUploader } from '@/components/preview/Ep001RigDeliveryUploader';
import { compileEp001RigDeliveryUploadShell } from '@/lib/tivvlejoy-ep001-rig-delivery-upload-shell';

export const metadata = {
  title: 'Episode 1 Rig Delivery Upload | TivvleJoy',
  description: 'Private multipart dropbox for final corrected Pip and Goat rig deliveries.',
};

export default function Ep001RigDeliveryUploadPage() {
  const shell = compileEp001RigDeliveryUploadShell();
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-10">
      <section className="studio-card p-4 sm:p-6">
        <Link href="/episode-one/external-handoff-package" className="text-sm font-bold text-[var(--color-primary)]">← External handoff package</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Episode 1 private character intake</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Final rig delivery dropbox</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--color-text-muted)]">When the corrected artist files arrive, upload the original Pip and Goat deliveries here. Files go directly to private object storage in resumable-sized multipart chunks. TivvleJoy verifies stored byte count and SHA-256 before issuing an immutable receipt.</p>
        <div className="mt-4 rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm leading-6 text-[var(--color-warning-foreground)]">
          <p className="font-bold">Upload is evidence intake only.</p>
          <p>No rig becomes technically approved, human-approved, episode-admitted, or eligible for paid animation/rendering merely because upload succeeds.</p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Ep001RigDeliveryUploader characterId="CHAR_GOAT_001" />
        <Ep001RigDeliveryUploader characterId="CHAR_PIP_001" />
      </div>

      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-bold">What happens after a verified upload</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">
          {shell.postUploadZeroCostQueue.map((item) => <li key={item}>{item}</li>)}
        </ol>
        <p className="mt-4 break-all font-mono text-[11px] text-[var(--color-text-muted)]">Upload shell SHA-256: {shell.rigDeliveryUploadShellSha256}</p>
      </section>
    </main>
  );
}

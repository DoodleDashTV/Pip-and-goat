'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type ImageRow = {
  id: string;
  label: string | null;
  reviewStatus: string;
  assetId: string | null;
  fileName: string | null;
  sha256: string | null;
  viewType: string | null;
  isPrimary: boolean;
};

type VersionRow = {
  id: string;
  versionNumber: number;
  approvedAt: string;
  primaryImageId: string | null;
  immutable: boolean;
};

export function ReferenceApproveClient({
  characterCode,
  characterName,
  dnaSummary,
  images,
  versions,
}: {
  characterId: string;
  characterCode: string;
  characterName: string;
  dnaSummary: string[];
  images: ImageRow[];
  versions: VersionRow[];
}) {
  const pendingPrimary =
    images.find(
      (i) =>
        i.assetId &&
        i.isPrimary &&
        (i.reviewStatus === 'PENDING_REVIEW' || i.reviewStatus === 'PENDING APPROVAL'),
    ) ??
    images.find((i) => i.assetId && i.reviewStatus === 'PENDING_REVIEW') ??
    images.find((i) => i.assetId);

  const [selectedId, setSelectedId] = useState(pendingPrimary?.id ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => images.find((i) => i.id === selectedId) ?? pendingPrimary ?? null,
    [images, selectedId, pendingPrimary],
  );

  const previewUrl = selected?.assetId
    ? `/api/production/media?assetId=${selected.assetId}`
    : null;

  async function approve() {
    if (!selected?.assetId) {
      setMessage('Upload a primary reference candidate first.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/production/canonical-characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve-primary',
          characterCode,
          referenceImageId: selected.id,
          approvedBy: 'studio-operator',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? 'Approval failed');
        return;
      }
      setMessage(
        `APPROVED & LOCKED — immutable reference v${data.version.versionNumber}. Future changes require a NEW CANDIDATE VERSION.`,
      );
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!selected) {
      setMessage('No candidate selected.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/production/canonical-characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject-primary',
          characterCode,
          referenceImageId: selected.id,
          rejectedBy: 'studio-operator',
          reason: 'Rejected from approval screen',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? 'Reject failed');
        return;
      }
      setMessage('Candidate REJECTED. Use REPLACE CANDIDATE to upload a new image.');
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-1">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">
          Reference Approval
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">{characterName}</h1>
        <p className="mt-1 text-sm font-semibold text-sun-400">{characterCode}</p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Approving locks an immutable PRIMARY_CANONICAL_REFERENCE version. It never overwrites prior
          versions. Old episodes keep their linked version.
        </p>
      </header>

      {!selected?.assetId ? (
        <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
          <p className="text-sm text-rose-300">
            No uploaded candidate yet. Go to Asset Intake and tap UPLOAD PRIMARY REFERENCE.
          </p>
          <Link
            href={`/asset-intake#${characterCode === 'CHAR_PIP_001' ? 'pip' : 'goat'}`}
            className="mt-4 flex min-h-[52px] items-center justify-center rounded-2xl bg-leaf-500 px-4 py-3 text-center font-extrabold text-ink-950"
          >
            Go to Asset Intake
          </Link>
        </section>
      ) : (
        <section className="space-y-4 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sun-400">
            {selected.reviewStatus === 'APPROVED' ? 'APPROVED' : 'PENDING APPROVAL'}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl ?? undefined}
            alt={`${characterName} reference`}
            className="mx-auto max-h-[70vh] w-full rounded-xl bg-ink-950 object-contain"
          />
          <dl className="space-y-3 break-all text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                File name
              </dt>
              <dd className="font-semibold">{selected.fileName ?? selected.label ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                SHA-256
              </dt>
              <dd className="font-mono text-xs">{selected.sha256 ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                Reference version
              </dt>
              <dd className="font-semibold">
                {versions[0]
                  ? `Latest approved v${versions[0].versionNumber} · candidate ${selected.id.slice(0, 8)}`
                  : `Candidate ${selected.id.slice(0, 8)} (not yet approved)`}
              </dd>
            </div>
          </dl>

          {images.length > 1 ? (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-sun-400">
                Choose candidate
              </p>
              <ul className="space-y-2">
                {images
                  .filter((i) => i.assetId)
                  .map((img) => (
                    <li key={img.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(img.id)}
                        className={[
                          'flex min-h-[48px] w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm',
                          selectedId === img.id
                            ? 'bg-leaf-500/20 text-leaf-300'
                            : 'bg-ink-950/40 text-mist-100',
                        ].join(' ')}
                      >
                        <span className="truncate">
                          {img.fileName ?? img.label ?? img.id.slice(0, 8)}
                        </span>
                        <span className="ml-2 shrink-0 text-xs">{img.reviewStatus}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-2xl font-bold">Locked DNA summary</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
          {dnaSummary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Approval warning: this locks an immutable visual reference. Approving a JPEG does NOT mark
          the character production-ready and does NOT unlock MODEL / RIG / FACIAL / 1080p gates.
          STRICT_CHARACTER_LOCK stays ON.
        </p>
      </section>

      <section className="grid gap-3">
        <button
          type="button"
          disabled={busy || !selected?.assetId || selected.reviewStatus === 'APPROVED'}
          onClick={() => void approve()}
          className="flex min-h-[56px] items-center justify-center rounded-2xl bg-leaf-500 px-4 py-4 text-base font-extrabold text-ink-950 disabled:opacity-50"
        >
          APPROVE & LOCK
        </button>
        <button
          type="button"
          disabled={busy || !selected?.assetId || selected.reviewStatus === 'APPROVED'}
          onClick={() => void reject()}
          className="flex min-h-[56px] items-center justify-center rounded-2xl border border-rose-400/50 bg-rose-500/10 px-4 py-4 text-base font-extrabold text-rose-200 disabled:opacity-50"
        >
          REJECT
        </button>
        <Link
          href={`/asset-intake#${characterCode === 'CHAR_PIP_001' ? 'pip' : 'goat'}`}
          className="flex min-h-[56px] items-center justify-center rounded-2xl border border-sun-400/40 bg-sun-500/10 px-4 py-4 text-center text-base font-extrabold text-sun-300"
        >
          REPLACE CANDIDATE
        </Link>
        {message ? <p className="break-words text-sm text-sun-400">{message}</p> : null}
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-2xl font-bold">Prior immutable versions</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {versions.map((v) => (
            <li key={v.id} className="rounded-2xl bg-ink-950/40 px-4 py-3">
              v{v.versionNumber} · {new Date(v.approvedAt).toLocaleString()} ·{' '}
              {v.immutable ? 'immutable' : 'mutable?'} · primary {v.primaryImageId}
            </li>
          ))}
          {!versions.length ? <li className="text-[var(--muted)]">None yet</li> : null}
        </ul>
      </section>
    </div>
  );
}

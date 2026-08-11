'use client';

import { useState } from 'react';

export function ReferenceApproveClient({
  characterId,
  characterCode,
  characterName,
  images,
  versions,
}: {
  characterId: string;
  characterCode: string;
  characterName: string;
  images: Array<{ id: string; label: string | null; reviewStatus: string; assetId: string | null }>;
  versions: Array<{ id: string; versionNumber: number; approvedAt: string; primaryImageId: string | null }>;
}) {
  const [primaryImageId, setPrimaryImageId] = useState(images.find((i) => i.assetId)?.id ?? '');
  const [additional, setAdditional] = useState<string[]>([]);
  const [silhouetteNotes, setSilhouetteNotes] = useState('');
  const [proportionNotes, setProportionNotes] = useState('');
  const [palette, setPalette] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function approve() {
    setMessage(null);
    if (!confirm) {
      setMessage('Confirm the summary before approving.');
      return;
    }
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve-reference-version',
        characterId,
        primaryImageId,
        additionalImageIds: additional,
        silhouetteNotes,
        proportionNotes,
        palette: palette ? { notes: palette } : undefined,
        lockedTraits: { silhouette: true, palette: true },
        approvedBy: 'studio-operator',
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Immutable reference v${data.version.versionNumber} created.` : data.error);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Reference Approval</p>
        <h1 className="mt-2 font-display text-4xl font-bold">
          {characterName} <span className="text-xl text-sun-400">{characterCode}</span>
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Select PRIMARY CANONICAL REFERENCE. Approval creates a new immutable version — never overwrites old ones.
        </p>
      </header>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-2xl font-bold">Reference images</h2>
        {!images.length ? (
          <p className="mt-3 text-sm text-rose-300">
            No reference images with uploaded assets. Upload via Asset Intake first.
          </p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {images.map((img) => (
              <li key={img.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-ink-950/40 px-4 py-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="primary"
                    checked={primaryImageId === img.id}
                    onChange={() => setPrimaryImageId(img.id)}
                    disabled={!img.assetId}
                  />
                  PRIMARY
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={additional.includes(img.id)}
                    onChange={(e) =>
                      setAdditional((prev) =>
                        e.target.checked ? [...prev, img.id] : prev.filter((id) => id !== img.id),
                      )
                    }
                  />
                  Secondary
                </label>
                <span>
                  {img.label ?? img.id.slice(0, 8)} · {img.reviewStatus}
                  {!img.assetId ? ' · NO ASSET FILE' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6 md:grid-cols-2">
        <label className="text-sm md:col-span-2">
          Palette notes
          <textarea
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2"
            value={palette}
            onChange={(e) => setPalette(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Silhouette notes
          <textarea
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2"
            value={silhouetteNotes}
            onChange={(e) => setSilhouetteNotes(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Proportion notes
          <textarea
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2"
            value={proportionNotes}
            onChange={(e) => setProportionNotes(e.target.value)}
          />
        </label>
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6 text-sm">
        <h2 className="font-display text-2xl font-bold">Confirmation summary</h2>
        <ul className="mt-3 space-y-1 text-[var(--muted)]">
          <li>Character: {characterName} ({characterCode})</li>
          <li>Primary image: {primaryImageId || '—'}</li>
          <li>Additional: {additional.length}</li>
          <li>Palette: {palette || '—'}</li>
          <li>Silhouette/proportions: {silhouetteNotes || '—'} / {proportionNotes || '—'}</li>
          <li>Locked traits: silhouette, palette</li>
        </ul>
        <label className="mt-4 flex items-center gap-2">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          I confirm this becomes an immutable approved reference version
        </label>
        <button
          type="button"
          onClick={() => void approve()}
          className="mt-4 rounded-2xl bg-leaf-500 px-4 py-2 text-sm font-extrabold text-ink-950"
        >
          Approve immutable reference version
        </button>
        {message ? <p className="mt-3 text-sun-400">{message}</p> : null}
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-2xl font-bold">Prior immutable versions</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {versions.map((v) => (
            <li key={v.id}>
              v{v.versionNumber} · {new Date(v.approvedAt).toLocaleString()} · primary {v.primaryImageId}
            </li>
          ))}
          {!versions.length ? <li className="text-[var(--muted)]">None yet</li> : null}
        </ul>
      </section>
    </div>
  );
}

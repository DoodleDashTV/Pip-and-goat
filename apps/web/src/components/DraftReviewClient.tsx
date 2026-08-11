'use client';

import { useEffect, useState } from 'react';

export function DraftReviewClient({ episodeId }: { episodeId: string }) {
  const [review, setReview] = useState<{
    id: string;
    status: string;
    draftUri: string | null;
    warnings: unknown;
    notes: Array<{ id: string; shotId: string | null; note: string }>;
  } | null>(null);
  const [note, setNote] = useState('');
  const [shotId, setShotId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/production/launch?action=draft-review&episodeId=${episodeId}`);
    const data = await res.json();
    setReview(data.review);
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/production/launch?action=draft-review&episodeId=${episodeId}`);
      const data = await res.json();
      setReview(data.review);
    })();
  }, [episodeId]);

  async function approve() {
    if (!review) return;
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve-draft',
        draftReviewId: review.id,
        approvedBy: 'studio-operator',
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? 'Draft approved for final.' : data.error);
    await load();
  }

  async function requestChanges() {
    if (!review) return;
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'request-draft-changes',
        draftReviewId: review.id,
        shotId: shotId || undefined,
        note,
        createdBy: 'studio-operator',
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? 'Change request recorded (shot-level; no full episode regen required).' : data.error);
    await load();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Draft Review</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Review first draft</h1>
        <p className="mt-3 text-[var(--muted)]">
          Real draft video appears only after Blender produces it. No fabricated players.
        </p>
      </header>

      {!review ? (
        <p className="text-[var(--muted)]">No draft review yet. Use GENERATE FIRST DRAFT when assets are READY.</p>
      ) : (
        <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6 space-y-4">
          <p className="text-sm">Status: {review.status}</p>
          {review.draftUri ? (
            <video controls className="w-full max-w-md rounded-2xl" src={review.draftUri} />
          ) : (
            <p className="text-rose-300">No draft MP4 yet — waiting for real Blender output.</p>
          )}
          <pre className="overflow-x-auto rounded-2xl bg-ink-950/50 p-3 text-xs">
            {JSON.stringify(review.warnings, null, 2)}
          </pre>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void approve()}
              className="rounded-2xl bg-leaf-500 px-4 py-2 text-sm font-extrabold text-ink-950"
            >
              APPROVE FOR FINAL
            </button>
          </div>
          <div className="space-y-2">
            <input
              className="w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2 text-sm"
              placeholder="Optional shot ID for REQUEST CHANGES"
              value={shotId}
              onChange={(e) => setShotId(e.target.value)}
            />
            <textarea
              className="w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2 text-sm"
              placeholder="Shot-level change notes"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void requestChanges()}
              className="rounded-2xl border border-leaf-400/40 px-4 py-2 text-sm font-bold text-leaf-300"
            >
              REQUEST CHANGES
            </button>
          </div>
          <ul className="text-sm text-[var(--muted)]">
            {review.notes?.map((n) => (
              <li key={n.id}>
                {n.shotId ? `Shot ${n.shotId}: ` : ''}
                {n.note}
              </li>
            ))}
          </ul>
        </section>
      )}
      {message ? <p className="text-sm text-sun-400">{message}</p> : null}
    </div>
  );
}

'use client';

import { useState } from 'react';

export function CharacterTestClient({
  characterId,
  characterCode,
  characterName,
  referencePreviewUrl,
  referenceMeta,
  modelCandidate,
  modelReviewId,
  modelReviewStatus,
}: {
  characterId: string;
  characterCode: string;
  characterName: string;
  referencePreviewUrl: string | null;
  referenceMeta: { fileName: string | null; sha256: string | null; version: string | null };
  modelCandidate: {
    version: number | null;
    checksum: string | null;
    fileName: string | null;
    status: string | null;
  };
  modelReviewId: string | null;
  modelReviewStatus: string | null;
}) {
  const [jobs, setJobs] = useState<
    Array<{ id: string; poseCode: string; status: string; blockedReason: string | null }>
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  async function run() {
    setMessage(null);
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'queue-character-previews', characterId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? 'Failed');
      return;
    }
    setJobs(data.jobs ?? []);
    setMessage('Pose tests queued or blocked honestly (no fake preview images).');
  }

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    if (!modelReviewId) {
      setReviewMessage('No pending model review. Upload a .blend after reference approval.');
      return;
    }
    const res = await fetch('/api/production/canonical-characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'decide-model-review',
        reviewId: modelReviewId,
        decision,
        decidedBy: 'studio-operator',
      }),
    });
    const data = await res.json();
    setReviewMessage(
      res.ok
        ? `Model review ${decision}. productionReady remains gated until rig/facial/1080p pass.`
        : data.error ?? 'Decision failed',
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 overflow-x-hidden px-1">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">
          Character Test Stage
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">
          {characterName} <span className="text-xl text-sun-400">{characterCode}</span>
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Standardized poses use the actual uploaded model. If Blender is unavailable: BLENDER
          EXECUTION REQUIRED.
        </p>
      </header>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="font-display text-2xl font-bold">Reference comparison</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Compare approved canonical reference vs actual Blender test renders. Check silhouette,
          proportions, eyes, comb/horns, beak/nose, materials, fur/feather, accessories, identity.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sun-400">
              Approved reference
            </p>
            {referencePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={referencePreviewUrl}
                alt={`${characterName} approved reference`}
                className="mt-2 max-h-[50vh] w-full rounded-xl bg-ink-950 object-contain"
              />
            ) : (
              <p className="mt-2 text-sm text-rose-300">No approved reference yet.</p>
            )}
            <p className="mt-2 break-all text-xs text-[var(--muted)]">
              {referenceMeta.fileName ?? '—'}
              {referenceMeta.sha256 ? ` · ${referenceMeta.sha256}` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sun-400">
              Blender test render
            </p>
            <div className="mt-2 flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-[var(--line)] bg-ink-950/50 p-4 text-center text-sm text-[var(--muted)]">
              {modelCandidate.fileName
                ? `Model candidate v${modelCandidate.version ?? '?'} uploaded (${modelCandidate.status}). Run pose tests with Blender to produce durable draft-renders — never fake this panel.`
                : 'Upload a real .blend first.'}
            </div>
            {modelCandidate.checksum ? (
              <p className="mt-2 break-all text-xs text-[var(--muted)]">
                {modelCandidate.fileName} · {modelCandidate.checksum}
              </p>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-xs text-sun-300">
          Review status: {modelReviewStatus ?? 'NONE'}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void decide('APPROVED')}
            className="flex min-h-[52px] items-center justify-center rounded-2xl bg-leaf-500 px-4 py-3 font-extrabold text-ink-950"
          >
            APPROVE MODEL LOCK
          </button>
          <button
            type="button"
            onClick={() => void decide('REJECTED')}
            className="flex min-h-[52px] items-center justify-center rounded-2xl border border-rose-400/50 bg-rose-500/10 px-4 py-3 font-extrabold text-rose-200"
          >
            REJECT MODEL
          </button>
        </div>
        {reviewMessage ? <p className="mt-3 text-sm text-sun-400">{reviewMessage}</p> : null}
      </section>

      <button
        type="button"
        onClick={() => void run()}
        className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-leaf-500 px-5 py-3 text-sm font-extrabold text-ink-950"
      >
        Run standardized pose tests
      </button>
      {message ? <p className="text-sm text-sun-400">{message}</p> : null}
      <ul className="space-y-2 text-sm">
        {jobs.map((job) => (
          <li key={job.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <span className="font-semibold">{job.poseCode}</span> · {job.status}
            {job.blockedReason ? <p className="text-rose-300">{job.blockedReason}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

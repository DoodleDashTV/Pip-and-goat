'use client';

import { useState } from 'react';

export function CharacterTestClient({
  characterId,
  characterCode,
  characterName,
}: {
  characterId: string;
  characterCode: string;
  characterName: string;
}) {
  const [jobs, setJobs] = useState<
    Array<{ id: string; poseCode: string; status: string; blockedReason: string | null }>
  >([]);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Character Test Stage</p>
        <h1 className="mt-2 font-display text-4xl font-bold">
          {characterName} <span className="text-xl text-sun-400">{characterCode}</span>
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Standardized poses use the actual uploaded model. If Blender is unavailable: BLENDER EXECUTION REQUIRED.
        </p>
      </header>
      <button
        type="button"
        onClick={() => void run()}
        className="rounded-2xl bg-leaf-500 px-5 py-3 text-sm font-extrabold text-ink-950"
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

'use client';

import { useEffect, useState } from 'react';

type VoiceRow = {
  character: { id: string; code: string; name: string };
  config: {
    provider: string | null;
    voiceId: string | null;
    voiceVersion: string | null;
    approved: boolean;
    blockedReason: string | null;
    auditionNotes: string | null;
  };
};

export function VoicesProductionClient() {
  const [voices, setVoices] = useState<VoiceRow[]>([]);
  const [script, setScript] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, number>>({});

  async function load() {
    const res = await fetch('/api/production/voices');
    const data = await res.json();
    setVoices(data.voices ?? []);
    const scriptRes = await fetch('/api/production/launch?action=audition-script');
    const scriptData = await scriptRes.json();
    setScript(scriptData.script ?? '');
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveVersion(characterId: string, form: HTMLFormElement) {
    setMessage(null);
    const fd = new FormData(form);
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'voice-version',
        characterId,
        provider: String(fd.get('provider') || '').trim() || null,
        voiceId: String(fd.get('voiceId') || '').trim() || null,
        model: String(fd.get('model') || '').trim() || null,
        speed: fd.get('speed') ? Number(fd.get('speed')) : null,
        pitch: fd.get('pitch') ? Number(fd.get('pitch')) : null,
        stability: fd.get('stability') ? Number(fd.get('stability')) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? 'Save failed');
      return;
    }
    setVersions((prev) => ({ ...prev, [characterId]: data.version.versionNumber }));
    setMessage(`Voice config version ${data.version.versionNumber} created (not approved yet).`);
    await load();
  }

  async function audition(characterId: string) {
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate-audition', characterId }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Audition status: ${data.version.status}` : data.error);
  }

  async function decide(characterId: string, decision: 'APPROVE' | 'REJECT') {
    const versionNumber = versions[characterId];
    if (!versionNumber) {
      setMessage('Save a voice version first.');
      return;
    }
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'voice-decision',
        characterId,
        versionNumber,
        decision,
        by: 'studio-operator',
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Voice ${decision}: v${versionNumber}` : data.error);
    await load();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Voice Onboarding</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Character Voice Approval</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Enter real provider voice IDs only. GENERATE AUDITION requires credentials — never fabricated.
          Approvals are versioned.
        </p>
      </header>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-xl font-bold">Canonical audition script</h2>
        <pre className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted)]">{script}</pre>
      </section>

      {message ? <p className="text-sm text-sun-400">{message}</p> : null}

      {voices.map((row) => (
        <section
          key={row.character.id}
          className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6"
        >
          <h2 className="font-display text-2xl font-bold">
            {row.character.name}{' '}
            <span className="text-base text-[var(--muted)]">{row.character.code}</span>
          </h2>
          <p className="mt-2 text-sm text-rose-300">
            {row.config.approved ? 'APPROVED' : row.config.blockedReason ?? 'Not configured'}
          </p>
          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveVersion(row.character.id, e.currentTarget);
            }}
          >
            <label className="text-sm">
              Provider
              <input
                name="provider"
                defaultValue={row.config.provider ?? ''}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Voice ID
              <input
                name="voiceId"
                defaultValue={row.config.voiceId ?? ''}
                placeholder="paste real provider voice ID"
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Model
              <input
                name="model"
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Speed
              <input
                name="speed"
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Pitch
              <input
                name="pitch"
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Stability
              <input
                name="stability"
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2"
              />
            </label>
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button
                type="submit"
                className="rounded-2xl bg-leaf-500 px-4 py-2 text-sm font-extrabold text-ink-950"
              >
                Save voice version
              </button>
              <button
                type="button"
                onClick={() => void audition(row.character.id)}
                className="rounded-2xl border border-leaf-400/40 px-4 py-2 text-sm font-bold text-leaf-300"
              >
                GENERATE AUDITION
              </button>
              <button
                type="button"
                onClick={() => void decide(row.character.id, 'APPROVE')}
                className="rounded-2xl border border-leaf-400/40 px-4 py-2 text-sm font-bold text-leaf-300"
              >
                APPROVE VOICE
              </button>
              <button
                type="button"
                onClick={() => void decide(row.character.id, 'REJECT')}
                className="rounded-2xl border border-rose-400/40 px-4 py-2 text-sm font-bold text-rose-300"
              >
                REJECT VOICE
              </button>
            </div>
          </form>
        </section>
      ))}
    </div>
  );
}

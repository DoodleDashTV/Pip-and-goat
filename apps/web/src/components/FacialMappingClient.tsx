'use client';

import { useEffect, useState } from 'react';

export function FacialMappingClient({
  characterId,
  characterCode,
  characterName,
}: {
  characterId: string;
  characterCode: string;
  characterName: string;
}) {
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [required, setRequired] = useState<string[]>([]);
  const [controls, setControls] = useState<string[]>([]);
  const [assetVersion, setAssetVersion] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [requiredComplete, setRequiredComplete] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/production/launch?action=facial-map&characterId=${characterId}`);
      const data = await res.json();
      setMappings((data.map?.mappings as Record<string, string | null>) ?? {});
      setRequired(data.requiredMouth ?? []);
      setControls(data.semanticControls ?? []);
      setAssetVersion(data.map?.assetVersion ?? 1);
      setRequiredComplete(Boolean(data.map?.requiredComplete));
    })();
  }, [characterId]);

  async function save() {
    setMessage(null);
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save-facial-map',
        characterId,
        assetVersion,
        controlType: 'SHAPE_KEY',
        mappings,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? 'Save failed');
      return;
    }
    setRequiredComplete(Boolean(data.map.requiredComplete));
    setMessage('Mappings saved. Final production stays blocked until mouth system is complete + approved.');
  }

  async function approve() {
    const res = await fetch('/api/production/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve-facial-map',
        characterId,
        assetVersion,
        approvedBy: 'studio-operator',
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? 'Facial map approved for this asset version.' : data.error);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Facial Rig Mapping</p>
        <h1 className="mt-2 font-display text-4xl font-bold">
          {characterName} <span className="text-xl text-sun-400">{characterCode}</span>
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Map shape keys or bones to semantic controls. Lip-sync validation uses these mappings.
        </p>
      </header>
      {message ? <p className="text-sm text-sun-400">{message}</p> : null}
      <p className="text-sm">
        Required mouth complete: {requiredComplete ? 'yes' : 'no'} · asset version {assetVersion}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {controls.map((control) => (
          <label key={control} className="text-sm">
            <span className={required.includes(control) ? 'text-rose-300' : 'text-mist-100'}>
              {control}
              {required.includes(control) ? ' *' : ''}
            </span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-ink-950/50 px-3 py-2"
              value={mappings[control] ?? ''}
              placeholder="shape key or bone name from uploaded model"
              onChange={(e) =>
                setMappings((prev) => ({ ...prev, [control]: e.target.value || null }))
              }
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-2xl bg-leaf-500 px-4 py-2 text-sm font-extrabold text-ink-950"
        >
          Save mappings
        </button>
        <button
          type="button"
          onClick={() => void approve()}
          className="rounded-2xl border border-leaf-400/40 px-4 py-2 text-sm font-bold text-leaf-300"
        >
          Approve facial map
        </button>
      </div>
    </div>
  );
}

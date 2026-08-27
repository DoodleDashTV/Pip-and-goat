'use client';

import { useState } from 'react';
import type { AdapterCharacterId, CanonicalControl, RigControlMapping } from '@/lib/tivvlejoy-rig-control-adapter';

type Validation = {
  valid: boolean;
  errors: string[];
  requiredControlCount: number;
  mappedControlCount: number;
  adapterSha256: string;
  normalized: RigControlMapping;
};

type SavedReceipt = {
  adapterSha256: string;
  receiptSha256: string;
  rigVersionId: string;
  structurallyValid: true;
  technicalInspectionPassed: false;
  humanApproved: false;
  productionEnabled: false;
};

export function Ep001RigControlAdapterEditor({ characterId, controls }: { characterId: AdapterCharacterId; controls: readonly CanonicalControl[] }) {
  const [mapping, setMapping] = useState<RigControlMapping>(() => ({
    schemaVersion: 'TIVVLEJOY_RIG_CONTROL_ADAPTER_V1',
    characterId,
    rigVersionId: '',
    rigSourceSha256: '',
    mappings: Object.fromEntries(controls.map((control) => [control.canonicalId, ''])),
  }));
  const [validation, setValidation] = useState<Validation | null>(null);
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState<SavedReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = characterId === 'CHAR_PIP_001' ? 'Pip' : 'Goat';

  function invalidate() {
    setValidation(null);
    setSaved(null);
  }

  function updateBinding(canonicalId: string, value: string) {
    invalidate();
    setMapping((current) => ({ ...current, mappings: { ...current.mappings, [canonicalId]: value } }));
  }

  async function validate() {
    setError(null);
    setSaved(null);
    const response = await fetch('/api/episode-one/rig-control-adapter/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mapping),
    });
    const payload = await response.json().catch(() => ({ errors: ['RIG_ADAPTER_RESPONSE_INVALID'] }));
    if (!response.ok && response.status !== 422) {
      setError(String(payload.errors?.[0] ?? 'RIG_ADAPTER_VALIDATION_FAILED'));
      return;
    }
    setValidation(payload as Validation);
  }

  async function saveReceipt() {
    if (!validation?.valid || !token.trim()) return;
    setError(null);
    const response = await fetch('/api/episode-one/rig-control-adapter/receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tivvlejoy-character-intake-token': token },
      body: JSON.stringify({ action: 'save', characterId, rigVersionId: validation.normalized.rigVersionId, mapping: validation.normalized }),
    });
    const payload = await response.json().catch(() => ({ code: 'RIG_ADAPTER_RECEIPT_RESPONSE_INVALID' }));
    if (!response.ok) {
      setError(String(payload.code ?? payload.error ?? 'RIG_ADAPTER_RECEIPT_SAVE_FAILED'));
      return;
    }
    setSaved(payload as SavedReceipt);
  }

  function fillAliasHints() {
    const mappings = Object.fromEntries(controls.map((control) => [control.canonicalId, control.aliases[0] ?? '']));
    setMapping((current) => ({ ...current, mappings }));
    invalidate();
  }

  return (
    <section className="studio-card space-y-4 p-4 sm:p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">{label} adapter</p>
        <h2 className="mt-1 font-display text-2xl font-bold">Map artist rig → TivvleJoy controls</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">This mapping does not change the artist rig. It creates a stable translation layer for TivvleJoy animation tooling.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">Rig version ID<input value={mapping.rigVersionId} disabled={Boolean(saved)} onChange={(e) => { invalidate(); setMapping((current) => ({ ...current, rigVersionId: e.target.value })); }} className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs" placeholder="UUID from rig receipt" /></label>
        <label className="text-sm font-bold">Rig source SHA-256<input value={mapping.rigSourceSha256} disabled={Boolean(saved)} onChange={(e) => { invalidate(); setMapping((current) => ({ ...current, rigSourceSha256: e.target.value })); }} className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs" placeholder="64-character SHA-256" /></label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={Boolean(saved)} onClick={fillAliasHints} className="min-h-touch rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-bold disabled:opacity-40">Fill alias examples</button>
        <button type="button" disabled={Boolean(saved)} onClick={() => void validate()} className="min-h-touch rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Validate mapping</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead><tr className="border-b border-[var(--color-border)]"><th className="p-2">Canonical role</th><th className="p-2">Artist control name</th><th className="p-2">Alias hints</th></tr></thead>
          <tbody>{controls.map((control) => <tr key={control.canonicalId} className="border-b border-[var(--color-border)] align-top"><td className="p-2"><p className="font-bold">{control.label}</p><p className="font-mono text-[11px] text-[var(--color-text-muted)]">{control.canonicalId}</p></td><td className="p-2"><input disabled={Boolean(saved)} value={mapping.mappings[control.canonicalId] ?? ''} onChange={(e) => updateBinding(control.canonicalId, e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 font-mono text-xs disabled:opacity-60" /></td><td className="p-2 font-mono text-[11px] text-[var(--color-text-muted)]">{control.aliases.join(', ')}</td></tr>)}</tbody>
        </table>
      </div>

      {validation?.valid && !saved ? (
        <div className="space-y-3 rounded-xl border border-[var(--color-success)] p-3 text-sm">
          <p className="font-bold">Mapping structurally complete — ready to store immutably</p>
          <p className="break-all font-mono text-[11px]">Adapter SHA-256: {validation.adapterSha256}</p>
          <label className="block font-bold">Private character intake token<input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm" /></label>
          <button type="button" disabled={!token.trim()} onClick={() => void saveReceipt()} className="min-h-touch rounded-xl bg-[var(--color-primary)] px-4 py-2 font-bold text-white disabled:opacity-40">Save immutable adapter receipt</button>
        </div>
      ) : null}

      {error ? <p className="rounded-xl border border-[var(--color-danger)] p-3 font-mono text-xs">{error}</p> : null}
      {validation && !validation.valid ? <div className="rounded-xl border border-[var(--color-warning)] p-3 text-sm"><p className="font-bold">Mapping incomplete</p><p className="mt-1">{validation.mappedControlCount} / {validation.requiredControlCount} required roles mapped.</p><ul className="mt-2 list-disc pl-5 font-mono text-xs">{validation.errors.slice(0, 12).map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      {saved ? <div className="rounded-xl border border-[var(--color-success)] p-3 text-sm"><p className="font-bold">Adapter stored immutably — rig still NOT approved</p><p className="mt-2 break-all font-mono text-[11px]">Adapter SHA-256: {saved.adapterSha256}</p><p className="mt-1 break-all font-mono text-[11px]">Receipt SHA-256: {saved.receiptSha256}</p><p className="mt-2">Technical inspection: waiting · human approval: waiting · Production: disabled.</p></div> : null}
    </section>
  );
}

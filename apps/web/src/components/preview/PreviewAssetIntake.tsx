'use client';

import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';

export function PreviewAssetIntake() {
  const { workspace, message, busy, registerAsset, reset } = usePreviewWorkspace();

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">
          Asset Intake
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">Preview asset registry</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--color-text-muted)]">
          Metadata only. No character files are uploaded. Pip/Goat theatrical binding is not
          completed. Nothing here is canonical.
        </p>
      </header>
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      <p className="status-error inline-flex min-h-touch items-center gap-2 rounded-full px-3 py-2 text-sm font-bold">
        <span aria-hidden="true">×</span>
        <span>Pip/Goat theatrical binding: Not completed</span>
      </p>
      <form
        className="studio-card space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          registerAsset({
            name: String(form.get('name') ?? ''),
            type: String(form.get('type') ?? 'OTHER') as 'CHARACTER' | 'PROP' | 'ENVIRONMENT' | 'OTHER',
            version: String(form.get('version') ?? 'v1'),
            notes: String(form.get('notes') ?? ''),
          });
          event.currentTarget.reset();
        }}
      >
        <label className="block text-sm font-semibold">
          Asset name
          <input name="name" required placeholder="Preview meadow stand-in" className="field-input mt-2" />
        </label>
        <label className="block text-sm font-semibold">
          Type
          <select name="type" required defaultValue="ENVIRONMENT" className="field-input mt-2">
            <option value="CHARACTER">Character</option>
            <option value="PROP">Prop</option>
            <option value="ENVIRONMENT">Environment</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Version
          <input name="version" defaultValue="v1" className="field-input mt-2" />
        </label>
        <label className="block text-sm font-semibold">
          Notes
          <textarea name="notes" rows={3} className="field-input mt-2" placeholder="Metadata only. Not a production file." />
        </label>
        <button type="submit" disabled={busy} className="btn-primary px-5 py-3 text-sm">
          Register Preview asset
        </button>
      </form>
      <section className="studio-card p-6">
        <h2 className="font-display text-2xl font-semibold">Registered Preview assets</h2>
        {workspace.assets.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No Preview assets yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {workspace.assets.map((asset) => (
              <li key={asset.id} className="rounded-2xl border border-[var(--color-border)] p-4">
                <p className="font-semibold">{asset.name}</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {asset.type} · {asset.version} · {asset.status} · {asset.classification} · canonical=
                  {String(asset.canonical)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

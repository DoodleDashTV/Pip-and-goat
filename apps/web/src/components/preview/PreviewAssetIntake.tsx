'use client';

import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewEmptyState, PreviewPageIntro } from './PreviewEmptyState';

export function PreviewAssetIntake() {
  const { workspace, message, busy, registerAsset, reset } = usePreviewWorkspace();
  const hasEpisode = workspace.episodes.length > 0;

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Assets"
        title="Add a Preview asset note"
        instruction="Write a name and type. This is metadata only. No file is uploaded. Canonical Pip and Goat stay unbound."
      />
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      <p className="status-error inline-flex min-h-touch items-center gap-2 rounded-full px-3 py-2 text-sm font-bold">
        <span aria-hidden="true">×</span>
        <span>Pip/Goat theatrical binding: Not completed</span>
      </p>
      {!hasEpisode ? (
        <PreviewEmptyState
          title="Create an episode first"
          body="Asset notes belong to the Preview episode you create in step 2. Nothing here uploads a production file."
          href="/new-episode"
          actionLabel="Go to New Episode"
        />
      ) : workspace.assets.length === 0 ? (
        <PreviewEmptyState
          title="No Preview assets yet"
          body="This is step 3 of 7. Add a stand-in name such as “Preview meadow.” It stays a note in this browser."
        />
      ) : null}
      <form
        className="studio-card space-y-4 p-4 sm:p-6"
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
        <button type="submit" disabled={busy} className="btn-primary w-full px-5 text-sm sm:w-auto">
          Register Preview asset
        </button>
      </form>
      <section className="studio-card p-4 sm:p-6">
        <h2 className="font-display text-2xl font-semibold">Registered Preview assets</h2>
        {workspace.assets.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No Preview assets yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {workspace.assets.map((asset) => (
              <li key={asset.id} className="rounded-2xl border border-[var(--color-border)] p-4">
                <p className="break-words font-semibold">{asset.name}</p>
                <p className="break-words text-sm text-[var(--color-text-muted)]">
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

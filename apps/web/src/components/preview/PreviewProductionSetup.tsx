'use client';

import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';

export function PreviewProductionSetup() {
  const { workspace, message, busy, saveSettings, reset } = usePreviewWorkspace();

  return (
    <div className="space-y-6 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">
          Production Setup
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold">Preview studio workspace</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--color-text-muted)]">
          Create or update this browser’s Preview workspace. Format and resource policy are locked
          to safe defaults.
        </p>
      </header>
      <PreviewBanner busy={busy} onReset={() => reset()} />
      <PreviewMessage message={message} />
      <form
        className="studio-card space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          saveSettings(String(form.get('projectName') ?? ''));
        }}
      >
        <label className="block text-sm font-semibold">
          Project name
          <input
            name="projectName"
            required
            defaultValue={workspace.settings.projectName}
            className="field-input mt-2"
          />
        </label>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-border)] p-4">
            <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Format</dt>
            <dd className="mt-1 font-semibold">{workspace.settings.format}</dd>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] p-4">
            <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">FPS</dt>
            <dd className="mt-1 font-semibold">{workspace.settings.fps}</dd>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] p-4">
            <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Paid resources</dt>
            <dd className="mt-1 font-semibold">Disabled</dd>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] p-4">
            <dt className="text-xs font-bold uppercase text-[var(--color-text-muted)]">
              Theatrical binding
            </dt>
            <dd className="mt-1 font-semibold">Not completed</dd>
          </div>
        </dl>
        <button type="submit" disabled={busy} className="btn-primary px-5 py-3 text-sm">
          {busy ? 'Saving…' : workspace.settingsSaved ? 'Save Preview settings' : 'Create Preview workspace'}
        </button>
      </form>
    </div>
  );
}

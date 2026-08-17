'use client';

import Link from 'next/link';
import { PreviewBanner, PreviewMessage } from './PreviewBanner';
import { PreviewEmptyState, PreviewPageIntro } from './PreviewEmptyState';
import { usePreviewWorkspace } from '@/lib/preview-workspace/use-preview-workspace';

export function PreviewProductionSetup() {
  const { workspace, message, busy, saveSettings, reset, exportBackup, importBackup } =
    usePreviewWorkspace();

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Production Setup"
        title="Start your Preview studio"
        instruction="Type a project name and save it. Format and paid-resource policy stay locked. This does not connect a production database."
      />
      <PreviewBanner
        busy={busy}
        onReset={() => reset()}
        onExport={() => exportBackup()}
        onImport={(text, byteLength, confirm) => importBackup(text, byteLength, confirm)}
      />
      <PreviewMessage message={message} />
      {!workspace.settingsSaved ? (
        <PreviewEmptyState
          title="Nothing saved yet"
          body="This is step 1 of 7. Enter a project name below, then tap Create Preview workspace. The save stays in this browser only."
        />
      ) : (
        <p className="status-success inline-flex min-h-touch items-center gap-2 rounded-full px-3 py-2 text-sm font-bold">
          <span aria-hidden="true">✓</span>
          <span>Preview settings saved in this browser</span>
        </p>
      )}
      <form
        className="studio-card space-y-4 p-4 sm:p-6"
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
        <button type="submit" disabled={busy} className="btn-primary w-full px-5 text-sm sm:w-auto">
          {busy ? 'Saving…' : workspace.settingsSaved ? 'Save Preview settings' : 'Create Preview workspace'}
        </button>
        {workspace.settingsSaved ? (
          <Link href="/new-episode" className="btn-highlight mt-2 w-full px-5 text-sm sm:mt-0 sm:w-auto">
            Next: New Episode
          </Link>
        ) : null}
      </form>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { calculatePreviewReadiness } from './readiness';
import {
  advancePreviewEpisode,
  createPreviewEpisode,
  createPreviewRenderRequest,
  PreviewWorkspaceError,
  registerPreviewAsset,
  resetPreviewStudio,
  savePreviewSettings,
  savePreviewVoiceProfile,
} from './service';
import { exportPreviewBackup, importPreviewBackup, serializePreviewBackup } from '../persistence/backup';
import { PersistenceError } from '../persistence/types';
import { defaultPreviewBackend, loadPreviewWorkspace } from './store';
import type { PreviewAsset, PreviewWorkspace } from './types';

export function usePreviewWorkspace() {
  const backend = useMemo(() => defaultPreviewBackend(), []);
  const [workspace, setWorkspace] = useState<PreviewWorkspace>(() => loadPreviewWorkspace(backend));
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWorkspace(loadPreviewWorkspace(backend));
    setHydrated(true);
  }, [backend]);

  const run = useCallback(
    <T extends PreviewWorkspace | { workspace: PreviewWorkspace }>(fn: () => T, ok?: string): T => {
      setBusy(true);
      try {
        const result = fn();
        const next = (result as { workspace?: PreviewWorkspace }).workspace ?? (result as PreviewWorkspace);
        setWorkspace(next);
        setMessage(ok ? { tone: 'ok', text: ok } : null);
        return result;
      } catch (error) {
        const text =
          error instanceof PreviewWorkspaceError || error instanceof PersistenceError
            ? error.message
            : 'Preview workspace error';
        setMessage({ tone: 'error', text });
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return {
    workspace,
    hydrated,
    message,
    busy,
    readiness: calculatePreviewReadiness(workspace),
    saveSettings: (projectName: string) =>
      run(() => savePreviewSettings({ projectName }, backend), 'Preview settings saved in this browser.'),
    createEpisode: (input: { title: string; episodeNumber: number; durationSec: number; premise: string }) =>
      run(() => createPreviewEpisode(input, backend), 'Preview episode created.'),
    registerAsset: (input: { name: string; type: PreviewAsset['type']; version: string; notes?: string }) =>
      run(() => registerPreviewAsset(input, backend), 'Preview asset registered. Not canonical.'),
    saveVoice: (input: { characterLabel: string; displayName: string; notes?: string }) =>
      run(() => savePreviewVoiceProfile(input, backend), 'Preview voice profile saved. No provider voice ID.'),
    advanceEpisode: (episodeId: string) =>
      run(() => advancePreviewEpisode(episodeId, backend), 'Draft stage advanced.'),
    requestRender: (episodeId: string) =>
      run(
        () => createPreviewRenderRequest(episodeId, backend),
        'Draft request recorded. Nothing was rendered.',
      ),
    reset: () => run(() => resetPreviewStudio(backend), 'Preview workspace reset. Production data was not touched.'),
    exportBackup: () => {
      const backup = exportPreviewBackup(backend);
      const serialized = serializePreviewBackup(backup);
      if (typeof window !== 'undefined') {
        const blob = new Blob([serialized], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'tivvlejoy-preview-backup.json';
        link.click();
        URL.revokeObjectURL(url);
      }
      setMessage({ tone: 'ok', text: 'Preview backup downloaded. It is not a production export.' });
      return backup;
    },
    importBackup: (text: string, byteLength: number, confirm: boolean) =>
      run(
        () => importPreviewBackup(text, backend, { confirm, byteLength }),
        'Preview backup imported into this browser. Production data was not touched.',
      ),
    clearMessage: () => setMessage(null),
  };
}

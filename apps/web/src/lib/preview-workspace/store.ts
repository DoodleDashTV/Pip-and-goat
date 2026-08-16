import {
  PREVIEW_STORAGE_KEY,
  PREVIEW_WORKSPACE_KIND,
  type PreviewSettings,
  type PreviewStoreBackend,
  type PreviewWorkspace,
} from './types';

export function defaultPreviewSettings(): PreviewSettings {
  return {
    projectName: 'TivvleJoy Preview Studio',
    format: '1080x1920',
    fps: 30,
    paidResourcesAuthorized: false,
    theatricalBindingCompleted: false,
  };
}

export function emptyPreviewWorkspace(): PreviewWorkspace {
  return {
    kind: PREVIEW_WORKSPACE_KIND,
    durable: false,
    label: 'Preview workspace — this browser only',
    settings: defaultPreviewSettings(),
    settingsSaved: false,
    episodes: [],
    assets: [],
    voices: [],
    renderRequests: [],
    lastResetAt: null,
  };
}

export function memoryBackend(initial: string | null = null): PreviewStoreBackend {
  let value = initial;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
    clear: () => {
      value = null;
    },
  };
}

export function localStorageBackend(): PreviewStoreBackend {
  return {
    read() {
      if (typeof window === 'undefined') return null;
      return window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    },
    write(value) {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(PREVIEW_STORAGE_KEY, value);
    },
    clear() {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
    },
  };
}

export function defaultPreviewBackend(): PreviewStoreBackend {
  return typeof window === 'undefined' ? memoryBackend() : localStorageBackend();
}

export function parsePreviewWorkspace(raw: string | null): PreviewWorkspace | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PreviewWorkspace;
    if (parsed.kind !== PREVIEW_WORKSPACE_KIND) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadPreviewWorkspace(backend: PreviewStoreBackend = defaultPreviewBackend()): PreviewWorkspace {
  return parsePreviewWorkspace(backend.read()) ?? emptyPreviewWorkspace();
}

export function savePreviewWorkspace(
  workspace: PreviewWorkspace,
  backend: PreviewStoreBackend = defaultPreviewBackend(),
): PreviewWorkspace {
  const next = { ...workspace, kind: PREVIEW_WORKSPACE_KIND, durable: false as const };
  backend.write(JSON.stringify(next));
  return next;
}

export function resetPreviewWorkspace(
  backend: PreviewStoreBackend = defaultPreviewBackend(),
): PreviewWorkspace {
  const next = {
    ...emptyPreviewWorkspace(),
    lastResetAt: new Date().toISOString(),
  };
  backend.write(JSON.stringify(next));
  return next;
}

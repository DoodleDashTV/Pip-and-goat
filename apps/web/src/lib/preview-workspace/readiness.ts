import type { PreviewReadinessItem, PreviewWorkspace } from './types';

export function calculatePreviewReadiness(workspace: PreviewWorkspace): {
  productionReady: false;
  items: PreviewReadinessItem[];
} {
  const episode = workspace.episodes[0] ?? null;
  const items: PreviewReadinessItem[] = [
    {
      id: 'settings',
      label: 'Preview settings saved',
      state: workspace.settingsSaved ? 'READY' : 'MISSING',
      href: '/production-setup',
      detail: workspace.settingsSaved
        ? `${workspace.settings.projectName} · ${workspace.settings.format} @ ${workspace.settings.fps} FPS`
        : 'Save Preview studio settings first.',
    },
    {
      id: 'episode',
      label: 'Preview episode created',
      state: episode ? 'READY' : 'MISSING',
      href: '/new-episode',
      detail: episode ? `${episode.title} · E${episode.episodeNumber}` : 'Create a Preview episode.',
    },
    {
      id: 'asset',
      label: 'Preview asset registered',
      state: workspace.assets.length ? 'READY' : 'MISSING',
      href: '/asset-intake',
      detail: workspace.assets.length
        ? `${workspace.assets.length} metadata-only Preview asset(s). None are canonical.`
        : 'Register at least one metadata-only Preview asset.',
    },
    {
      id: 'voice',
      label: 'Preview voice profile saved',
      state: workspace.voices.length ? 'READY' : 'MISSING',
      href: '/voices',
      detail: workspace.voices.length
        ? `${workspace.voices.length} saved profile(s). No provider voice ID.`
        : 'Save a Preview voice profile. Audition stays disabled.',
    },
    {
      id: 'workflow',
      label: 'Draft workflow progress',
      state: episode ? 'READY' : 'MISSING',
      href: '/workflow',
      detail: episode
        ? `Current draft stage ${episode.currentStage}. Final render stays closed.`
        : 'Advance draft stages after creating an episode.',
    },
    {
      id: 'theatrical',
      label: 'Pip/Goat theatrical binding',
      state: 'CLOSED',
      href: '/workflow',
      detail: 'Not completed. Preview cannot bind theatrical Pip or Goat.',
    },
    {
      id: 'paid',
      label: 'Paid resources',
      state: 'CLOSED',
      href: '/render-queue',
      detail: 'Not authorized. Preview cannot start a paid GPU job.',
    },
    {
      id: 'audio-final',
      label: 'Final audio',
      state: 'CLOSED',
      href: '/voices',
      detail: 'No generated audio. Provider credentials are not configured.',
    },
    {
      id: 'qc',
      label: 'Production QC',
      state: 'CLOSED',
      href: '/readiness',
      detail: 'Preview QC is not a production QC pass.',
    },
    {
      id: 'render',
      label: 'Final render',
      state: 'CLOSED',
      href: '/render-queue',
      detail: 'Draft requests are not rendered and have no output files.',
    },
  ];

  return { productionReady: false, items };
}

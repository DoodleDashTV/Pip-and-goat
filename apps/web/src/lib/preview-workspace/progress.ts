import { calculatePreviewReadiness } from './readiness';
import type { PreviewWorkspace } from './types';

export type PreviewStepStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export type PreviewGuideStepId =
  | 'production-setup'
  | 'new-episode'
  | 'assets'
  | 'voices'
  | 'workflow'
  | 'readiness'
  | 'render-queue';

export type PreviewGuideStep = {
  id: PreviewGuideStepId;
  href: string;
  title: string;
  instruction: string;
  status: PreviewStepStatus;
};

const PREVIEW_PATH_IDS = ['settings', 'episode', 'asset', 'voice'] as const;

export function previewStepLabel(status: PreviewStepStatus): string {
  switch (status) {
    case 'not_started':
      return 'Not started';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'blocked':
      return 'Blocked';
  }
}

export function evaluatePreviewGuide(workspace: PreviewWorkspace): PreviewGuideStep[] {
  const hasSetup = workspace.settingsSaved;
  const episode = workspace.episodes[0] ?? null;
  const hasEpisode = Boolean(episode);
  const hasAssets = workspace.assets.length > 0;
  const hasVoices = workspace.voices.length > 0;
  const workflowStage = episode?.currentStage ?? 'BRIEF';
  const readiness = calculatePreviewReadiness(workspace);
  const pathItems = readiness.items.filter((item) =>
    (PREVIEW_PATH_IDS as readonly string[]).includes(item.id),
  );
  const pathReady = pathItems.every((item) => item.state === 'READY');
  const pathStarted = pathItems.some((item) => item.state === 'READY');
  const hasDraftRender = workspace.renderRequests.length > 0;

  return [
    {
      id: 'production-setup',
      href: '/production-setup',
      title: 'Production Setup',
      instruction: 'Save preview studio settings. This stays in this browser only.',
      status: hasSetup ? 'completed' : 'not_started',
    },
    {
      id: 'new-episode',
      href: '/new-episode',
      title: 'New Episode',
      instruction: hasSetup
        ? 'Create one episode record so the rest of the path can start.'
        : 'Save Production Setup first.',
      status: !hasSetup ? 'blocked' : hasEpisode ? 'completed' : 'not_started',
    },
    {
      id: 'assets',
      href: '/asset-intake',
      title: 'Assets',
      instruction: hasEpisode
        ? 'Add a preview asset note. Canonical Pip and Goat stay unbound.'
        : 'Create an episode first.',
      status: !hasEpisode ? 'blocked' : hasAssets ? 'completed' : 'not_started',
    },
    {
      id: 'voices',
      href: '/voices',
      title: 'Voices',
      instruction: hasEpisode
        ? 'Add a voice note. Paid ElevenLabs and audition stay blocked.'
        : 'Create an episode first.',
      status: !hasEpisode ? 'blocked' : hasVoices ? 'completed' : 'not_started',
    },
    {
      id: 'workflow',
      href: '/workflow',
      title: 'Episode Workflow',
      instruction: hasEpisode
        ? 'Walk the draft stages. Theatrical and later gates stay closed.'
        : 'Create an episode first.',
      status: !hasEpisode
        ? 'blocked'
        : workflowStage === 'OUTPUT_GATE'
          ? 'completed'
          : workflowStage === 'BRIEF'
            ? 'not_started'
            : 'in_progress',
    },
    {
      id: 'readiness',
      href: '/readiness',
      title: 'Readiness',
      instruction: hasEpisode
        ? 'Confirm the preview checklist. A green list still does not start a render.'
        : 'Create an episode first.',
      status: !hasEpisode
        ? 'blocked'
        : pathReady
          ? 'completed'
          : pathStarted
            ? 'in_progress'
            : 'not_started',
    },
    {
      id: 'render-queue',
      href: '/render-queue',
      title: 'Render Queue',
      instruction: pathReady
        ? 'Save a draft request. Paid GPU and production render stay blocked.'
        : 'Finish earlier steps before a draft request can be saved.',
      status: !hasEpisode || !pathReady ? 'blocked' : hasDraftRender ? 'completed' : 'not_started',
    },
  ];
}

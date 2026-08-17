import { savePreviewSettings, createPreviewEpisode } from '../preview-workspace/service';
import { loadPreviewWorkspace } from '../preview-workspace/store';
import type { PreviewEpisode, PreviewStoreBackend, PreviewWorkspace } from '../preview-workspace/types';
import { GOAT_VOICE_GUIDE, PIP_VOICE_GUIDE } from './guides';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID } from './types';

export const SAMPLE_VOICE_PROJECT_NAME = 'TivvleJoy Sample Voice Studio';
export const SAMPLE_VOICE_EPISODE_TITLE = 'Sample Voice Episode';
export const SAMPLE_VOICE_EPISODE_NUMBER = 1;
export const SAMPLE_VOICE_EPISODE_DURATION = 30;
export const SAMPLE_VOICE_PREMISE =
  'Pip and Goat find a tiny map crumb in the sunny meadow and decide who checks the stones.';
export const SAMPLE_VOICE_SCENE_ID = 'scene-sample-meadow';
export const SAMPLE_VOICE_SCENE_LABEL = 'Sample scene — Meadow map crumb';

export const SAMPLE_PIP_DIALOGUE =
  'That shiny crumb by the stones looks like a piece of our map. I can hop closer and peek without scaring the grass.';
export const SAMPLE_GOAT_DIALOGUE =
  'I will hold the map flat and watch the path. You check the crumb, and I will call if the trail twists.';

export const SAMPLE_VOICE_HREF = '/voice-production';

export function isSampleVoiceEpisode(episode: PreviewEpisode | null | undefined): boolean {
  return episode?.title === SAMPLE_VOICE_EPISODE_TITLE && episode.episodeNumber === SAMPLE_VOICE_EPISODE_NUMBER;
}

export function createSampleVoiceEpisode(backend: PreviewStoreBackend): {
  workspace: PreviewWorkspace;
  episode: PreviewEpisode;
  created: boolean;
} {
  let workspace = loadPreviewWorkspace(backend);
  if (!workspace.settingsSaved) {
    workspace = savePreviewSettings({ projectName: SAMPLE_VOICE_PROJECT_NAME }, backend);
  }
  const existing = workspace.episodes.find(isSampleVoiceEpisode);
  if (existing) {
    return { workspace, episode: existing, created: false };
  }
  const created = createPreviewEpisode(
    {
      title: SAMPLE_VOICE_EPISODE_TITLE,
      episodeNumber: SAMPLE_VOICE_EPISODE_NUMBER,
      durationSec: SAMPLE_VOICE_EPISODE_DURATION,
      premise: SAMPLE_VOICE_PREMISE,
    },
    backend,
  );
  return { workspace: created.workspace, episode: created.episode, created: true };
}

export function sampleSceneLines() {
  return [
    {
      characterId: PIP_CHARACTER_ID,
      voiceProfileVersion: 'pip_default_v1',
      sceneId: SAMPLE_VOICE_SCENE_ID,
      dialogueText: SAMPLE_PIP_DIALOGUE,
      emotion: PIP_VOICE_GUIDE.defaultEmotion,
      performanceDirection: PIP_VOICE_GUIDE.defaultDirection,
      pronunciationNotes: PIP_VOICE_GUIDE.pronunciationNotes,
    },
    {
      characterId: GOAT_CHARACTER_ID,
      voiceProfileVersion: 'goat_default_v1',
      sceneId: SAMPLE_VOICE_SCENE_ID,
      dialogueText: SAMPLE_GOAT_DIALOGUE,
      emotion: GOAT_VOICE_GUIDE.defaultEmotion,
      performanceDirection: GOAT_VOICE_GUIDE.defaultDirection,
      pronunciationNotes: GOAT_VOICE_GUIDE.pronunciationNotes,
    },
  ] as const;
}

export function sampleDialogueIsOriginal(): boolean {
  const catchphrases = [...PIP_VOICE_GUIDE.catchphrases, ...GOAT_VOICE_GUIDE.catchphrases];
  return ![SAMPLE_PIP_DIALOGUE, SAMPLE_GOAT_DIALOGUE].some((line) => catchphrases.includes(line));
}

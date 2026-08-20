import { sha256Canonical } from './hash';
import { DIRECTOR_PACKAGE_SCHEMA, FINAL_SHOT_SPEC_SCHEMA } from './types';
import type { EpisodeCreativeIntent } from './showrunner';
import type { StoryBeat } from './beats';
import type { CinematographyPlan } from './cinematography';
import type { CharacterStagingPlan } from './staging';
import type { DirectorPerformanceNote } from './performance-notes';
import type { LightingDirection } from './lighting';
import type { VfxDirection } from './vfx';
import type { EditorialTimeline, ShotTiming } from './editorial';
import type { DialogueEdit } from './dialogue';
import type { AmbienceEvent, MusicCue, SfxEvent } from './sound';
import type { CaptionCue } from './captions';
import type { DailiesNote, RevisionRequest, ShotApprovalMatrix } from './dailies';
import type { VerticalCompositionResult, ShotCompositionQc } from './composition';
import type { ScreenDirectionLedger } from './screen-direction';

export type FinalShotSpec = {
  schemaVersion: typeof FINAL_SHOT_SPEC_SCHEMA;
  shotId: string;
  storyBeatId: string;
  cameraSha256: string;
  stagingSha256: string;
  animationManifestSha256: string | null;
  environmentSha256: string | null;
  lightingSha256: string;
  vfxSha256: string | null;
  dialogueSha256: string | null;
  sfxSha256: string | null;
  musicSha256: string | null;
  captionSha256: string | null;
  continuitySha256: string;
  shotAssemblySha256: string | null;
  compositionQcSha256: string;
  qcRequirements: string[];
  shotSize: CinematographyPlan['shotSize'];
  cameraMotion: CinematographyPlan['cameraMotion'];
  cameraIntent: CinematographyPlan['cameraIntent'];
  mediaExecuted: false;
  finalShotSpecSha256: string;
};

export function compileFinalShotSpec(input: {
  shotId: string;
  beat: StoryBeat;
  camera: CinematographyPlan;
  staging: CharacterStagingPlan;
  lighting: LightingDirection;
  composition: VerticalCompositionResult;
  compositionQc: ShotCompositionQc;
  animationManifestSha256?: string | null;
  environmentSha256?: string | null;
  vfx?: VfxDirection[];
  dialogue?: DialogueEdit | null;
  sfx?: SfxEvent[];
  music?: MusicCue | null;
  caption?: CaptionCue | null;
  continuitySha256: string;
  shotAssemblySha256?: string | null;
}): FinalShotSpec {
  const body = {
    schemaVersion: FINAL_SHOT_SPEC_SCHEMA,
    shotId: input.shotId,
    storyBeatId: input.beat.beatId,
    cameraSha256: input.camera.cinematographySha256,
    stagingSha256: input.staging.stagingSha256,
    animationManifestSha256: input.animationManifestSha256 ?? null,
    environmentSha256: input.environmentSha256 ?? null,
    lightingSha256: input.lighting.lightingSha256,
    vfxSha256: input.vfx?.length ? sha256Canonical(input.vfx.map((item) => item.vfxDependencySha256)) : null,
    dialogueSha256: input.dialogue?.dialogueEditSha256 ?? null,
    sfxSha256: input.sfx?.length ? sha256Canonical(input.sfx.map((item) => item.sfxDependencySha256)) : null,
    musicSha256: input.music?.musicDependencySha256 ?? null,
    captionSha256: input.caption?.captionDependencySha256 ?? null,
    continuitySha256: input.continuitySha256,
    shotAssemblySha256: input.shotAssemblySha256 ?? null,
    compositionQcSha256: input.compositionQc.qcSha256,
    qcRequirements: ['FACE_SAFE', 'CAPTION_SAFE', 'NO_AUTO_APPROVAL'],
    shotSize: input.camera.shotSize,
    cameraMotion: input.camera.cameraMotion,
    cameraIntent: input.camera.cameraIntent,
    mediaExecuted: false as const,
  };
  return { ...body, finalShotSpecSha256: sha256Canonical(body) };
}

export type EpisodeDirectorPackage = {
  schemaVersion: typeof DIRECTOR_PACKAGE_SCHEMA;
  episodeId: string;
  intent: EpisodeCreativeIntent;
  beats: StoryBeat[];
  shotSequence: string[];
  finalShotSpecs: FinalShotSpec[];
  editorial: EditorialTimeline;
  timings: ShotTiming[];
  performanceNotes: DirectorPerformanceNote[];
  dialogue: DialogueEdit[];
  sfx: SfxEvent[];
  ambience: AmbienceEvent[];
  music: MusicCue[];
  captions: CaptionCue[];
  reviews: DailiesNote[];
  revisions: RevisionRequest[];
  approvals: ShotApprovalMatrix[];
  screenDirection: ScreenDirectionLedger;
  synthetic: true;
  humanFinalApproval: false;
  episodeDirectorPackageSha256: string;
};

export function compileDirectorPackage(input: Omit<EpisodeDirectorPackage, 'schemaVersion' | 'synthetic' | 'humanFinalApproval' | 'episodeDirectorPackageSha256'>): EpisodeDirectorPackage {
  const body = {
    schemaVersion: DIRECTOR_PACKAGE_SCHEMA,
    synthetic: true as const,
    humanFinalApproval: false as const,
    ...input,
  };
  const hashBody = {
    schemaVersion: DIRECTOR_PACKAGE_SCHEMA,
    episodeId: input.episodeId,
    intent: input.intent.episodeCreativeIntentSha256,
    beats: input.beats.map((item) => item.beatDependencySha256),
    shotSequence: input.shotSequence,
    finalShotSpecs: input.finalShotSpecs.map((item) => item.finalShotSpecSha256),
    editorial: input.editorial.timelineSha256,
    dialogue: input.dialogue.map((item) => item.dialogueEditSha256),
    sfx: input.sfx.map((item) => item.sfxDependencySha256),
    music: input.music.map((item) => item.musicDependencySha256),
    captions: input.captions.map((item) => item.captionDependencySha256),
    approvals: input.approvals.map((item) => item.matrixSha256),
    screenDirection: input.screenDirection.ledgerSha256,
  };
  return { ...body, episodeDirectorPackageSha256: sha256Canonical(hashBody) };
}

export function bindDirectorPackageToPacket(productionPacketSha256: string, directorPackageSha256: string): string {
  return sha256Canonical({ productionPacketSha256, directorPackageSha256 });
}

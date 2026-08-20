import type { SimulatedEpisode, SimulatedShot } from '@/lib/tivvlejoy-production-studio/simulation';
import { compileEpisodeProductionPacket } from '@/lib/tivvlejoy-production-studio/packet';
import { buildEpisodeCreativeIntent } from './showrunner';
import { buildStoryBeats, type StoryBeat } from './beats';
import { intentForBeat } from './shot-language';
import { planCinematography, type CinematographyPlan } from './cinematography';
import { defaultSubjectsFor, evaluateShotCompositionQc, evaluateVerticalComposition } from './composition';
import { conversationModeFor, planCharacterStaging, type CharacterStagingPlan } from './staging';
import { evaluateScreenDirection } from './screen-direction';
import { planCameraMotion } from './camera-motion';
import { buildDirectorPerformanceNote } from './performance-notes';
import { lightingIntentFor, planLightingDirection } from './lighting';
import { vfxForShot } from './vfx';
import { buildEditorialTimeline, durationForShot, evaluateEditRhythm } from './editorial';
import { buildVoiceTimingReceipt, planDialogueEdit, type DialogueEdit } from './dialogue';
import { ambienceForLocation, musicRoleForBeat, planMusicCue, planSfxEvent, sfxFromContacts, type AmbienceEvent, type MusicCue, type SfxEvent } from './sound';
import { captionsFromDialogue, evaluateCaptionQc } from './captions';
import { planJlCut } from './jl-cuts';
import { addDailiesNote, emptyApprovalMatrix } from './dailies';
import { bindDirectorPackageToPacket, compileDirectorPackage, compileFinalShotSpec, type EpisodeDirectorPackage, type FinalShotSpec } from './specs';
import type { CameraMotion, ShotIntent } from './types';

export type CompiledShot = {
  shotId: string;
  beat: StoryBeat;
  intent: ShotIntent;
  camera: CinematographyPlan;
  staging: CharacterStagingPlan;
  lightingSha256: string;
  finalSpec: FinalShotSpec;
};

export type CompiledEpisode = {
  episodeId: string;
  directorPackage: EpisodeDirectorPackage;
  productionPacketSha256: string;
  directorBindingSha256: string;
  compiledShots: CompiledShot[];
  editRhythmPassed: boolean;
  captionQcPassed: boolean;
  compileMs: number;
};

function speakerFor(shot: SimulatedShot, index: number): 'PIP' | 'GOAT' | null {
  if (!shot.dialogueRef) return null;
  return index % 2 === 0 ? 'PIP' : 'GOAT';
}

export function compileDirectedEpisode(episode: SimulatedEpisode, options: { fps?: number } = {}): CompiledEpisode {
  const started = Date.now();
  const fps = options.fps ?? 30;
  const locations = [...new Set(episode.shots.map((shot) => shot.locationId))];
  const intent = buildEpisodeCreativeIntent({
    episodeId: episode.episodeId,
    episodeNumber: episode.episodeNumber,
    primaryLocation: locations[0],
    secondaryLocation: locations[1] ?? locations[0],
    heroProp: 'map',
  });
  const beats = buildStoryBeats({ intent, shotCount: episode.shots.length, locations, heroProp: 'map' });
  const compiledShots: CompiledShot[] = [];
  const timings = [];
  const videoShots: Array<{ shotId: string; durationFrames: number; intent: ShotIntent; locationId: string; dialogueRef?: string | null }> = [];
  const dialogue: DialogueEdit[] = [];
  const sfx: SfxEvent[] = [];
  const ambience: AmbienceEvent[] = [];
  const music: MusicCue[] = [];
  const performanceNotes = [];
  const lightingPlans = [];
  let cursor = 0;
  let movingStreak = 0;
  let previousMotion: CameraMotion | undefined;

  episode.shots.forEach((shot, index) => {
    const beat = beats[index] ?? beats[beats.length - 1]!;
    const shotIntent = intentForBeat(beat, index, episode.shots.length);
    const speaker = speakerFor(shot, index);
    const travel = shotIntent === 'FOLLOW' || shotIntent === 'TRACKING' ? (index % 2 === 0 ? 'RIGHT' : 'LEFT') : 'NONE';
    const motionPlan = planCameraMotion({ intent: shotIntent, beat, previousMotion, movingStreak });
    previousMotion = motionPlan.motion;
    movingStreak = motionPlan.motion === 'STATIC' ? 0 : movingStreak + 1;
    const camera = planCinematography({
      shotId: shot.shotId,
      intent: shotIntent,
      speaker,
      travel,
      prop: beat.prop,
      cameraMotion: motionPlan.motion,
    });
    const mode = conversationModeFor({
      speaker,
      sharedDiscovery: beat.beatType === 'DISCOVERY',
      jointReaction: beat.beatType === 'REACTION' || beat.beatType === 'PAYOFF',
      map: Boolean(beat.prop),
      walking: shotIntent === 'FOLLOW' || shotIntent === 'TRACKING',
      leading: beat.beatType === 'MOVEMENT' ? 'PIP' : undefined,
    });
    const staging = planCharacterStaging({
      shotId: shot.shotId,
      mode,
      travel,
      leading: beat.beatType === 'MOVEMENT' ? 'PIP' : undefined,
      prop: Boolean(beat.prop),
    });
    const subjects = defaultSubjectsFor(camera, shotIntent === 'FOLLOW' || shotIntent === 'TRACKING');
    const composition = evaluateVerticalComposition({ subjects, locomotionImportant: shotIntent === 'FOLLOW', captionsEnabled: Boolean(shot.dialogueRef) });
    const compositionQc = evaluateShotCompositionQc({ plan: camera, composition, subjects });
    const lighting = planLightingDirection({
      shotId: shot.shotId,
      intent: lightingIntentFor({ weather: shot.weather, timeOfDay: shot.timeOfDay, beatType: beat.beatType }),
      heroProp: Boolean(beat.prop),
    });
    lightingPlans.push(lighting);
    const vfx = vfxForShot({ shotId: shot.shotId, weather: shot.weather, location: shot.locationId, beatType: beat.beatType });
    const dialogueFrames = shot.dialogueRef ? 48 : null;
    const timing = durationForShot({ beat, intent: shotIntent, pace: intent.paceProfile, dialogueFrames });
    timing.shotId = shot.shotId;
    timing.inFrame = cursor;
    timing.outFrame = cursor + timing.durationFrames;
    timings.push(timing);
    videoShots.push({
      shotId: shot.shotId,
      durationFrames: timing.durationFrames,
      intent: shotIntent,
      locationId: shot.locationId,
      dialogueRef: shot.dialogueRef,
    });
    if (shot.dialogueRef && speaker) {
      const receipt = buildVoiceTimingReceipt({
        dialogueRef: shot.dialogueRef,
        speaker,
        lineDurationFrames: dialogueFrames ?? 48,
      });
      dialogue.push(planDialogueEdit({ lineId: shot.dialogueRef, speaker, shotId: shot.shotId, pictureIn: timing.inFrame, receipt }));
    }
    sfx.push(
      ...sfxFromContacts({
        shotId: shot.shotId,
        frame: timing.inFrame + 12,
        locationId: shot.locationId,
        pipFoot: shotIntent === 'FOLLOW' || shotIntent === 'TRACKING',
        goatHoof: shotIntent === 'FOLLOW' || shotIntent === 'TRACKING',
        prop: beat.prop ? 'MAP_UNFOLD' : shot.locationId.includes('bakery') && index === 0 ? 'DOOR_OPEN' : null,
      }),
    );
    if (beat.beatType === 'COMEDY') {
      sfx.push(planSfxEvent({
        sfxEventId: `${shot.shotId}_BUMP`,
        semanticType: 'COMEDY_BUMP',
        frame: timing.inFrame + 20,
        duration: 6,
        intensity: 0.4,
        spatialRole: 'CENTER',
        characterId: 'GOAT',
        propId: null,
        locationId: shot.locationId,
        priority: 'ACCENT',
      }));
    }
    ambience.push({
      layer: ambienceForLocation(shot.locationId, shot.weather, shot.timeOfDay),
      startFrame: timing.inFrame,
      endFrame: timing.outFrame,
      locationId: shot.locationId,
    });
    music.push(planMusicCue({
      cueId: `${shot.shotId}_MUSIC`,
      role: musicRoleForBeat(beat.beatType),
      startFrame: timing.inFrame,
      endFrame: timing.outFrame,
      storyBeatRefs: [beat.beatId],
      dialoguePresent: Boolean(shot.dialogueRef),
    }));
    for (const characterId of ['PIP', 'GOAT'] as const) {
      performanceNotes.push(buildDirectorPerformanceNote({
        shotId: shot.shotId,
        characterId,
        beat,
        mode,
        speaking: speaker === characterId,
      }));
    }
    const finalSpec = compileFinalShotSpec({
      shotId: shot.shotId,
      beat,
      camera,
      staging,
      lighting,
      composition,
      compositionQc,
      environmentSha256: shot.environmentDependencySha256,
      shotAssemblySha256: shot.assemblyDependencySha256,
      vfx,
      dialogue: dialogue.find((item) => item.shotId === shot.shotId) ?? null,
      sfx: sfx.filter((item) => item.sfxEventId.startsWith(shot.shotId)),
      music: music[music.length - 1] ?? null,
      continuitySha256: shot.locationSha256,
    });
    compiledShots.push({ shotId: shot.shotId, beat, intent: shotIntent, camera, staging, lightingSha256: lighting.lightingSha256, finalSpec });
    cursor = timing.outFrame;
  });

  const editorial = buildEditorialTimeline({ episodeId: episode.episodeId, fps, shots: videoShots });
  const captions = captionsFromDialogue(dialogue, (lineId) => {
    const speaker = dialogue.find((item) => item.lineId === lineId)?.speaker ?? 'PIP';
    return speaker === 'PIP' ? 'Did you see that?' : 'I see it.';
  });
  const captionQc = evaluateCaptionQc({
    captions,
    shotRanges: timings.map((item) => ({ shotId: item.shotId, inFrame: item.inFrame, outFrame: item.outFrame })),
  });
  const rhythm = evaluateEditRhythm({
    pace: intent.paceProfile,
    shots: compiledShots.map((shot, index) => ({
      shotId: shot.shotId,
      durationFrames: timings[index]!.durationFrames,
      intent: shot.intent,
      beatType: shot.beat.beatType,
      dialogueFrames: dialogue.find((item) => item.shotId === shot.shotId) ? 48 : null,
    })),
  });
  const screenDirection = evaluateScreenDirection({
    episodeId: episode.episodeId,
    shots: compiledShots.map((shot, index) => ({
      shotId: shot.shotId,
      staging: shot.staging,
      camera: shot.camera,
      establishing: shot.intent === 'ESTABLISHING' || index === 0,
    })),
  });
  for (let index = 1; index < compiledShots.length; index += 1) {
    planJlCut({
      outgoing: { shotId: compiledShots[index - 1]!.shotId, outFrame: timings[index - 1]!.outFrame, dialogue: dialogue.find((item) => item.shotId === compiledShots[index - 1]!.shotId) },
      incoming: { shotId: compiledShots[index]!.shotId, inFrame: timings[index]!.inFrame, dialogue: dialogue.find((item) => item.shotId === compiledShots[index]!.shotId) },
    });
  }
  const reviews = compiledShots.slice(0, 2).map((shot) =>
    addDailiesNote({
      reviewId: `${shot.shotId}_NOTE`,
      shotId: shot.shotId,
      shotDependencySha256: shot.finalSpec.finalShotSpecSha256,
      reviewerClass: 'SYNTHETIC_OPERATOR',
      reviewCategory: 'CAMERA',
      note: 'Synthetic review placeholder. Not a human approval.',
      severity: 'NOTE',
      frameRange: { start: 0, end: 12 },
      createdAt: '1970-01-01T00:00:00.000Z',
      resolvedByRevision: null,
    }),
  );
  const approvals = compiledShots.map((shot) => emptyApprovalMatrix(shot.shotId));
  const directorPackage = compileDirectorPackage({
    episodeId: episode.episodeId,
    intent,
    beats,
    shotSequence: compiledShots.map((shot) => shot.shotId),
    finalShotSpecs: compiledShots.map((shot) => shot.finalSpec),
    editorial,
    timings,
    performanceNotes,
    dialogue,
    sfx,
    ambience,
    music,
    captions,
    reviews,
    revisions: [],
    approvals,
    screenDirection,
  });
  const packet = compileEpisodeProductionPacket({
    episodeId: episode.episodeId,
    episodeVersion: 'v1',
    scriptSha256: episode.scriptSha256,
    voiceReceipts: episode.voiceReceipts,
    shots: episode.shots.map((shot) => ({
      shotId: shot.shotId,
      locationId: shot.locationId,
      environmentDependencySha256: shot.environmentDependencySha256,
      assemblyDependencySha256: shot.assemblyDependencySha256,
      dialogueRefs: shot.dialogueRef ? [shot.dialogueRef] : [],
      charactersVisible: shot.charactersVisible,
    })),
  });
  return {
    episodeId: episode.episodeId,
    directorPackage,
    productionPacketSha256: packet.productionPacketSha256,
    directorBindingSha256: bindDirectorPackageToPacket(packet.productionPacketSha256, directorPackage.episodeDirectorPackageSha256),
    compiledShots,
    editRhythmPassed: rhythm.passed,
    captionQcPassed: captionQc.passed,
    compileMs: Date.now() - started,
  };
}

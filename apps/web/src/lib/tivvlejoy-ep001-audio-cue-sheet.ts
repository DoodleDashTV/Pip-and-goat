import {
  planDucking,
  planMusicCue,
  planSfxEvent,
  sha256Canonical,
  type AmbienceLayer,
  type SfxType,
} from '@/lib/tivvlejoy-nightshift-production';
import { compileEp001ProductionPackage } from '@/lib/tivvlejoy-ep001-production-package';
import {
  GOAT_CHARACTER_ID,
  GOAT_VOICE_PROFILE,
  PIP_CHARACTER_ID,
  PIP_VOICE_PROFILE,
} from '@/lib/voice-production/types';
import {
  VOICE_IDENTITY_CHECKPOINT,
  publicVoiceIdentitySnapshot,
} from '@/lib/voice-production/approved-voice-settings';

export const EP001_AUDIO_CUE_SHEET_SCHEMA = 'TIVVLEJOY_EP001_AUDIO_CUE_SHEET_V1' as const;

type Ep001Package = ReturnType<typeof compileEp001ProductionPackage>;

type SfxCueDetail = {
  semanticType: SfxType;
  offsetFrames: number;
  durationFrames: number;
  syncTarget: string;
  spatialRole: 'LEFT' | 'CENTER' | 'RIGHT' | 'WIDE';
  characterId: 'PIP' | 'GOAT' | null;
  propId: 'STORY_MAP' | 'MAP_FRAGMENT' | 'PIP_SCARF' | 'PIP_BACKPACK' | null;
  priority: 'BACKGROUND' | 'STORY' | 'ACCENT';
};

const VOICE_BINDINGS = {
  PIP: {
    characterId: PIP_CHARACTER_ID,
    voiceProfileVersion: PIP_VOICE_PROFILE,
  },
  GOAT: {
    characterId: GOAT_CHARACTER_ID,
    voiceProfileVersion: GOAT_VOICE_PROFILE,
  },
} as const;

const SFX_CUE_DETAILS: Record<string, SfxCueDetail[]> = {
  EP001_SH01: [
    {
      semanticType: 'FOOTSTEP_SOFT',
      offsetFrames: 42,
      durationFrames: 4,
      syncTarget: 'Pip’s first planted step outside the bakery',
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: null,
      priority: 'BACKGROUND',
    },
    {
      semanticType: 'HOOF_SOFT',
      offsetFrames: 55,
      durationFrames: 4,
      syncTarget: 'Goat’s first visible follow step',
      spatialRole: 'RIGHT',
      characterId: 'GOAT',
      propId: null,
      priority: 'BACKGROUND',
    },
    {
      semanticType: 'SCARF_RUSTLE',
      offsetFrames: 90,
      durationFrames: 10,
      syncTarget: 'Pip turns toward the fluttering clue',
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: 'PIP_SCARF',
      priority: 'ACCENT',
    },
  ],
  EP001_SH02: [
    {
      semanticType: 'MAP_UNFOLD',
      offsetFrames: 22,
      durationFrames: 10,
      syncTarget: 'The story map reaches its fully open pose',
      spatialRole: 'CENTER',
      characterId: 'PIP',
      propId: 'STORY_MAP',
      priority: 'STORY',
    },
    {
      semanticType: 'WING_FLUTTER',
      offsetFrames: 7,
      durationFrames: 8,
      syncTarget: 'Pip catches and stabilizes the map',
      spatialRole: 'CENTER',
      characterId: 'PIP',
      propId: null,
      priority: 'ACCENT',
    },
  ],
  EP001_SH03: [
    {
      semanticType: 'SCARF_RUSTLE',
      offsetFrames: 76,
      durationFrames: 8,
      syncTarget: 'Wind crosses Pip as Goat tracks the clue',
      spatialRole: 'CENTER',
      characterId: 'PIP',
      propId: 'PIP_SCARF',
      priority: 'ACCENT',
    },
  ],
  EP001_SH04: [
    {
      semanticType: 'WING_FLUTTER',
      offsetFrames: 30,
      durationFrames: 8,
      syncTarget: 'Pip’s wing reaches the screen-right point',
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: null,
      priority: 'ACCENT',
    },
    {
      semanticType: 'COMEDY_BUMP',
      offsetFrames: 142,
      durationFrames: 12,
      syncTarget: 'Goat settles from his eager ready bounce',
      spatialRole: 'RIGHT',
      characterId: 'GOAT',
      propId: null,
      priority: 'ACCENT',
    },
  ],
  EP001_SH05: [
    {
      semanticType: 'FOOTSTEP_SOFT',
      offsetFrames: 28,
      durationFrames: 4,
      syncTarget: 'Pip’s first readable travel step',
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: null,
      priority: 'BACKGROUND',
    },
    {
      semanticType: 'HOOF_SOFT',
      offsetFrames: 36,
      durationFrames: 4,
      syncTarget: 'Goat’s matching travel step',
      spatialRole: 'RIGHT',
      characterId: 'GOAT',
      propId: null,
      priority: 'BACKGROUND',
    },
    {
      semanticType: 'BACKPACK_RUSTLE',
      offsetFrames: 108,
      durationFrames: 10,
      syncTarget: 'Pip’s backpack settles at the meadow arrival',
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: 'PIP_BACKPACK',
      priority: 'ACCENT',
    },
  ],
  EP001_SH06: [
    {
      semanticType: 'HOOF_SOFT',
      offsetFrames: 42,
      durationFrames: 4,
      syncTarget: 'Goat plants before the low search',
      spatialRole: 'RIGHT',
      characterId: 'GOAT',
      propId: null,
      priority: 'BACKGROUND',
    },
    {
      semanticType: 'SCARF_RUSTLE',
      offsetFrames: 105,
      durationFrames: 8,
      syncTarget: 'Pip shades her eyes while scanning',
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: 'PIP_SCARF',
      priority: 'ACCENT',
    },
  ],
  EP001_SH07: [
    {
      semanticType: 'WING_FLUTTER',
      offsetFrames: 90,
      durationFrames: 8,
      syncTarget: 'Pip’s pointing wing lands on the high clue',
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: null,
      priority: 'ACCENT',
    },
    {
      semanticType: 'SCARF_RUSTLE',
      offsetFrames: 46,
      durationFrames: 8,
      syncTarget: 'Pip tilts her gaze upward',
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: 'PIP_SCARF',
      priority: 'BACKGROUND',
    },
  ],
  EP001_SH08: [
    {
      semanticType: 'OBJECT_PICKUP',
      offsetFrames: 105,
      durationFrames: 6,
      syncTarget: 'Pip secures the map fragment',
      spatialRole: 'CENTER',
      characterId: 'PIP',
      propId: 'MAP_FRAGMENT',
      priority: 'STORY',
    },
    {
      semanticType: 'MAGIC_SPARKLE',
      offsetFrames: 165,
      durationFrames: 24,
      syncTarget: 'The retrieved corner catches its first warm glint',
      spatialRole: 'CENTER',
      characterId: null,
      propId: 'MAP_FRAGMENT',
      priority: 'STORY',
    },
  ],
  EP001_SH09: [
    {
      semanticType: 'MAGIC_SPARKLE',
      offsetFrames: 60,
      durationFrames: 30,
      syncTarget: 'The new doodle path completes itself',
      spatialRole: 'WIDE',
      characterId: null,
      propId: 'STORY_MAP',
      priority: 'STORY',
    },
    {
      semanticType: 'MAP_UNFOLD',
      offsetFrames: 30,
      durationFrames: 10,
      syncTarget: 'Pip presents the repaired map to camera',
      spatialRole: 'CENTER',
      characterId: 'PIP',
      propId: 'STORY_MAP',
      priority: 'STORY',
    },
  ],
  EP001_SH10: [
    {
      semanticType: 'MAP_FOLD',
      offsetFrames: 10,
      durationFrames: 10,
      syncTarget: 'Pip closes the repaired map before speaking',
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: 'STORY_MAP',
      priority: 'STORY',
    },
    {
      semanticType: 'COMEDY_BUMP',
      offsetFrames: 145,
      durationFrames: 12,
      syncTarget: 'Goat’s silent happy bounce lands after Pip’s question',
      spatialRole: 'RIGHT',
      characterId: 'GOAT',
      propId: null,
      priority: 'ACCENT',
    },
    {
      semanticType: 'FOOTSTEP_DIRT',
      offsetFrames: 152,
      durationFrames: 4,
      syncTarget: 'Pip begins the screen-right exit',
      spatialRole: 'LEFT',
      characterId: 'PIP',
      propId: null,
      priority: 'BACKGROUND',
    },
    {
      semanticType: 'HOOF_SOFT',
      offsetFrames: 158,
      durationFrames: 4,
      syncTarget: 'Goat follows Pip onto the new path',
      spatialRole: 'RIGHT',
      characterId: 'GOAT',
      propId: null,
      priority: 'BACKGROUND',
    },
  ],
};

const AMBIENCE_INTENTS: Record<AmbienceLayer, string> = {
  VILLAGE_DAY: 'Warm neighborhood air, distant birds, and restrained village life.',
  VILLAGE_NIGHT: 'Reserved for a future nighttime village cue.',
  FOREST_DAY: 'Light meadow wind, distant birds, and soft foliage without masking dialogue.',
  FOREST_RAIN: 'Reserved for a future rainy forest cue.',
  RIVER: 'Reserved for a future water-location cue.',
  TAVERN_INTERIOR: 'Reserved for a future interior cue.',
  MOUNTAIN_WIND: 'Reserved for a future mountain cue.',
  FESTIVAL: 'Reserved for a future crowd cue.',
  SNOW_SOFT: 'Reserved for a future snow cue.',
  MAGICAL_NIGHT:
    'A brief magical shimmer bed for the map reveal; it does not change the golden-hour picture continuity.',
};

const QUALITY_GATES = [
  ['AUDIO_GATE_01', 'All eight exact approved voice receipts and source hashes are bound.'],
  ['AUDIO_GATE_02', 'Word timing and line timing fit inside their assigned picture shots.'],
  ['AUDIO_GATE_03', 'Pip and Goat retain the approved voice-identity checkpoint.'],
  ['AUDIO_GATE_04', 'Dialogue remains clear above music, ambience, and story sound effects.'],
  ['AUDIO_GATE_05', 'Every sound effect is synchronized to the approved final animation.'],
  ['AUDIO_GATE_06', 'Ambience covers the full timeline without accidental gaps or hard seams.'],
  ['AUDIO_GATE_07', 'Music is original or backed by an approved commercial license receipt.'],
  ['AUDIO_GATE_08', 'No dialogue line is duplicated, clipped, rewritten, or time-stretched.'],
  ['AUDIO_GATE_09', 'The final mix measures -14 LUFS ±1 with true peak at or below -1 dBTP.'],
  ['AUDIO_GATE_10', 'The mix remains intelligible on phone speakers and in mono.'],
  ['AUDIO_GATE_11', 'The audio master ends on frame 1800 with the picture master.'],
  ['AUDIO_GATE_12', 'A human reviews story clarity, performance, music, and final mix quality.'],
] as const;

function secondsForFrame(frame: number, fps: number): number {
  return Number((frame / fps).toFixed(3));
}

function compileAmbienceSegments(episode: Ep001Package) {
  const segments: Array<{
    layer: AmbienceLayer;
    startFrame: number;
    endFrame: number;
    locationId: string;
    shotIds: string[];
  }> = [];

  for (const shot of episode.shots) {
    const previous = segments.at(-1);
    if (
      previous &&
      previous.layer === shot.ambience &&
      previous.locationId === shot.locationId &&
      previous.endFrame === shot.inFrame
    ) {
      previous.endFrame = shot.outFrame;
      previous.shotIds.push(shot.shotId);
      continue;
    }
    segments.push({
      layer: shot.ambience,
      startFrame: shot.inFrame,
      endFrame: shot.outFrame,
      locationId: shot.locationId,
      shotIds: [shot.shotId],
    });
  }

  return segments.map((segment, index) => {
    const body = {
      ambienceCueId: `EP001_AMB_${String(index + 1).padStart(2, '0')}`,
      ...segment,
      intent: AMBIENCE_INTENTS[segment.layer],
      transitionFrames: index === 0 ? 0 : 12,
      sourceRequirement: 'APPROVED_LICENSED_OR_ORIGINAL_AUDIO' as const,
      bindingState: 'UNRESOLVED_APPROVED_AUDIO_REQUIRED' as const,
      sourceAssetId: null,
      sourceSha256: null,
      licenseReceiptRef: null,
      audioIncluded: false as const,
    };
    return { ...body, ambienceCueSha256: sha256Canonical(body) };
  });
}

export function compileEp001AudioCueSheet(episode: Ep001Package = compileEp001ProductionPackage()) {
  if (episode.episodeId !== 'EP001') throw new Error('EP001_AUDIO_CUE_SHEET_WRONG_EPISODE');
  if (episode.format.totalFrames !== 1_800 || episode.format.fps !== 30) {
    throw new Error('EP001_AUDIO_CUE_SHEET_FORMAT_MISMATCH');
  }

  const dialogueCues = episode.dialogue.map((line) => {
    const shot = episode.shots.find((candidate) => candidate.shotId === line.shotId);
    if (!shot) throw new Error(`EP001_AUDIO_DIALOGUE_SHOT_MISSING:${line.lineId}`);
    const voice = VOICE_BINDINGS[line.speaker];
    return {
      lineId: line.lineId,
      captionId: `CAP_${line.lineId}`,
      shotId: line.shotId,
      speaker: line.speaker,
      characterId: voice.characterId,
      voiceProfileVersion: voice.voiceProfileVersion,
      voiceIdentityCheckpoint: VOICE_IDENTITY_CHECKPOINT,
      text: line.text,
      delivery: line.delivery,
      startFrame: line.startFrame,
      endFrame: line.endFrame,
      durationFrames: line.endFrame - line.startFrame,
      startSeconds: secondsForFrame(line.startFrame, episode.format.fps),
      endSeconds: secondsForFrame(line.endFrame, episode.format.fps),
      pictureHandles: {
        preRollFrames: line.startFrame - shot.inFrame,
        postRollFrames: shot.outFrame - line.endFrame,
      },
      bindingState: 'AWAITING_APPROVED_REAL_VOICE_RECEIPT' as const,
      voiceReceiptRef: null,
      audioSourceSha256: null,
      lineTimingReceiptRef: null,
      wordTimingReceiptRef: null,
      audioIncluded: false as const,
      generationAuthorized: false as const,
    };
  });

  const sfxCues = episode.shots.flatMap((shot) => {
    const details = SFX_CUE_DETAILS[shot.shotId];
    if (!details) throw new Error(`EP001_AUDIO_SFX_PLAN_MISSING:${shot.shotId}`);
    if (details.map((detail) => detail.semanticType).join('|') !== shot.sfx.join('|')) {
      throw new Error(`EP001_AUDIO_SFX_CONTRACT_MISMATCH:${shot.shotId}`);
    }
    return details.map((detail, index) => {
      const frame = shot.inFrame + detail.offsetFrames;
      if (frame < shot.inFrame || frame + detail.durationFrames > shot.outFrame) {
        throw new Error(`EP001_AUDIO_SFX_OUTSIDE_SHOT:${shot.shotId}:${detail.semanticType}`);
      }
      const planned = planSfxEvent({
        sfxEventId: `${shot.shotId}_SFX_${String(index + 1).padStart(2, '0')}`,
        semanticType: detail.semanticType,
        frame,
        duration: detail.durationFrames,
        intensity: detail.priority === 'STORY' ? 0.65 : detail.priority === 'ACCENT' ? 0.5 : 0.38,
        spatialRole: detail.spatialRole,
        characterId: detail.characterId,
        propId: detail.propId,
        locationId: shot.locationId,
        priority: detail.priority,
      });
      return {
        ...planned,
        shotId: shot.shotId,
        offsetFrames: detail.offsetFrames,
        frameSeconds: secondsForFrame(frame, episode.format.fps),
        syncTarget: detail.syncTarget,
        sourceRequirement: 'APPROVED_LICENSED_OR_ORIGINAL_AUDIO' as const,
        bindingState: 'UNRESOLVED_APPROVED_AUDIO_REQUIRED' as const,
        sourceAssetId: null,
        sourceSha256: null,
        licenseReceiptRef: null,
      };
    });
  });

  const ambienceCues = compileAmbienceSegments(episode);
  const musicCues = episode.shots.map((shot, index) => {
    const cue = planMusicCue({
      cueId: `EP001_MUS_${String(index + 1).padStart(2, '0')}`,
      role: shot.musicRole,
      startFrame: shot.inFrame,
      endFrame: shot.outFrame,
      storyBeatRefs: [shot.shotId],
      dialoguePresent: shot.dialogueLineIds.length > 0,
    });
    return {
      ...cue,
      shotId: shot.shotId,
      intent: `${shot.beat} support without competing with dialogue or story sound effects.`,
      sourceRequirement: 'ORIGINAL_OR_APPROVED_COMMERCIAL_LICENSE_REQUIRED' as const,
      bindingState: 'UNRESOLVED_APPROVED_AUDIO_REQUIRED' as const,
      sourceAssetId: null,
      sourceSha256: null,
      licenseReceiptRef: null,
      mixApprovalReceiptRef: null,
    };
  });

  const duckWindows = dialogueCues.map((line) => {
    const storySfx = sfxCues.find(
      (cue) =>
        cue.priority === 'STORY' &&
        cue.frame < line.endFrame &&
        cue.frame + cue.duration > line.startFrame,
    );
    return {
      duckWindowId: `EP001_DUCK_${line.lineId}`,
      lineId: line.lineId,
      startFrame: line.startFrame,
      endFrame: line.endFrame,
      state: storySfx
        ? planDucking({ dialogue: true, sfxPriority: 'STORY' })
        : planDucking({ dialogue: true }),
      storySfxEventId: storySfx?.sfxEventId ?? null,
    };
  });

  const shotMixRows = episode.shots.map((shot) => ({
    shotId: shot.shotId,
    inFrame: shot.inFrame,
    outFrame: shot.outFrame,
    startSeconds: secondsForFrame(shot.inFrame, episode.format.fps),
    endSeconds: secondsForFrame(shot.outFrame, episode.format.fps),
    dialogueLineIds: dialogueCues
      .filter((line) => line.shotId === shot.shotId)
      .map((line) => line.lineId),
    sfxEventIds: sfxCues.filter((cue) => cue.shotId === shot.shotId).map((cue) => cue.sfxEventId),
    ambienceCueId: ambienceCues.find((cue) => cue.shotIds.includes(shot.shotId))?.ambienceCueId,
    musicCueId: musicCues.find((cue) => cue.shotId === shot.shotId)?.cueId,
  }));
  if (shotMixRows.some((row) => !row.ambienceCueId || !row.musicCueId)) {
    throw new Error('EP001_AUDIO_SHOT_MIX_BINDING_INCOMPLETE');
  }

  const qualityGates = QUALITY_GATES.map(([id, label]) => ({
    id,
    label,
    status: 'PENDING_REAL_AUDIO_BINDING_MIX_AND_HUMAN_REVIEW' as const,
    complete: false as const,
    autoApproval: false as const,
  }));
  const voiceIdentity = publicVoiceIdentitySnapshot();
  const body = {
    schemaVersion: EP001_AUDIO_CUE_SHEET_SCHEMA,
    episodeId: episode.episodeId,
    workingTitle: episode.workingTitle,
    productionPackageSha256: episode.packageSha256,
    state: 'LOGICAL_AUDIO_CUE_SHEET_READY_REAL_AUDIO_UNBOUND' as const,
    format: {
      fps: episode.format.fps,
      totalFrames: episode.format.totalFrames,
      durationSeconds: episode.format.durationSeconds,
      sampleRateHz: 48_000 as const,
      bitDepth: 24 as const,
      channels: 2 as const,
    },
    voiceIdentity,
    dialogueCues,
    sfxCues,
    ambienceCues,
    musicCues,
    duckWindows,
    shotMixRows,
    mixTargets: {
      measurementState: 'TARGETS_ONLY_NOT_MEASURED' as const,
      integratedLufs: -14 as const,
      integratedLufsTolerance: 1 as const,
      maxTruePeakDbtp: -1 as const,
      dialoguePriority: true as const,
      monoCompatibilityRequired: true as const,
      phoneSpeakerReviewRequired: true as const,
    },
    metrics: {
      dialogueCueCount: dialogueCues.length,
      pipDialogueCueCount: dialogueCues.filter((cue) => cue.speaker === 'PIP').length,
      goatDialogueCueCount: dialogueCues.filter((cue) => cue.speaker === 'GOAT').length,
      dialogueCharacterCount: dialogueCues.reduce((total, cue) => total + cue.text.length, 0),
      sfxCueCount: sfxCues.length,
      storySfxCueCount: sfxCues.filter((cue) => cue.priority === 'STORY').length,
      ambienceCueCount: ambienceCues.length,
      musicCueCount: musicCues.length,
      qualityGateCount: qualityGates.length,
    },
    qualityGates,
    authority: {
      voiceGenerationAuthorized: false as const,
      voiceReceiptsApproved: false as const,
      sfxBindingsApproved: false as const,
      ambienceBindingsApproved: false as const,
      musicBindingsApproved: false as const,
      mixExecutionAllowed: false as const,
      finalAudioApprovalIssued: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      logicalCuesOnly: true as const,
      voiceProviderCalls: 0 as const,
      networkCalls: 0 as const,
      paidRequests: 0 as const,
      audioBytesIncluded: 0 as const,
      storageMutations: 0 as const,
      productionMutations: 0 as const,
      copyrightedMusicIncluded: false as const,
    },
  };

  return { ...body, cueSheetSha256: sha256Canonical(body) };
}

export type Ep001AudioCueSheet = ReturnType<typeof compileEp001AudioCueSheet>;

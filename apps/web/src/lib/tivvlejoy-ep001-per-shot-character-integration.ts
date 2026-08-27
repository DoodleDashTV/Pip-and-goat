import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AudioCueSheet } from '@/lib/tivvlejoy-ep001-audio-cue-sheet';
import { compileEp001CharacterSceneIntegration } from '@/lib/tivvlejoy-character-scene-integration';

export const EP001_PER_SHOT_CHARACTER_INTEGRATION_SCHEMA = 'TIVVLEJOY_EP001_PER_SHOT_CHARACTER_INTEGRATION_V1' as const;

type CharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';

const BASE_CONTROLS: Record<CharacterId, readonly string[]> = {
  CHAR_PIP_001: ['ROOT','MASTER','COG','BODY','CHEST','HEAD','NECK'],
  CHAR_GOAT_001: ['ROOT','MASTER','COG','BODY','CHEST','HEAD','NECK'],
};

const DIALOGUE_CONTROLS: Record<CharacterId, readonly string[]> = {
  CHAR_PIP_001: ['HEAD','EYE_AIM','BLINK_L','BLINK_R','BEAK_UPPER','BEAK_LOWER'],
  CHAR_GOAT_001: ['HEAD','EYE_AIM','BLINK','JAW','MOUTH'],
};

const SEMANTIC_CONTROLS: Record<string, Partial<Record<CharacterId, readonly string[]>>> = {
  FOOTSTEP_SOFT: { CHAR_PIP_001: ['LEG_IK_L','LEG_IK_R','FOOT_L','FOOT_R','TOE_L','TOE_R','HALLUX_L','HALLUX_R'] },
  FOOTSTEP_DIRT: { CHAR_PIP_001: ['LEG_IK_L','LEG_IK_R','FOOT_L','FOOT_R','TOE_L','TOE_R','HALLUX_L','HALLUX_R'] },
  HOOF_SOFT: { CHAR_GOAT_001: ['LEG_IK_L','LEG_IK_R','HOOF_L','HOOF_R'] },
  WING_FLUTTER: { CHAR_PIP_001: ['WING_L','WING_R'] },
  MAP_UNFOLD: { CHAR_PIP_001: ['WING_L','WING_R','PROP_ATTACH'] },
  MAP_FOLD: { CHAR_PIP_001: ['WING_L','WING_R','PROP_ATTACH'] },
  OBJECT_PICKUP: { CHAR_PIP_001: ['WING_L','WING_R','PROP_ATTACH'] },
  SCARF_RUSTLE: { CHAR_PIP_001: ['BODY','CHEST','HEAD'] },
  BACKPACK_RUSTLE: { CHAR_PIP_001: ['BODY','CHEST'] },
  COMEDY_BUMP: { CHAR_GOAT_001: ['COG','BODY','CHEST','LEG_IK_L','LEG_IK_R'] },
};

function canonicalCharacterId(value: 'PIP' | 'GOAT' | null): CharacterId | null {
  return value === 'PIP' ? 'CHAR_PIP_001' : value === 'GOAT' ? 'CHAR_GOAT_001' : null;
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

export function compileEp001PerShotCharacterIntegration() {
  const audio = compileEp001AudioCueSheet();
  const scene = compileEp001CharacterSceneIntegration();

  const shots = audio.shotMixRows.map((row) => {
    const dialogue = audio.dialogueCues.filter((cue) => cue.shotId === row.shotId);
    const sfx = audio.sfxCues.filter((cue) => cue.shotId === row.shotId);
    const evidencedCharacters = unique([
      ...dialogue.map((cue) => cue.characterId),
      ...sfx.map((cue) => canonicalCharacterId(cue.characterId)).filter((value): value is CharacterId => Boolean(value)),
    ]) as CharacterId[];

    const characterPlans = evidencedCharacters.map((characterId) => {
      const characterDialogue = dialogue.filter((cue) => cue.characterId === characterId);
      const characterSfx = sfx.filter((cue) => canonicalCharacterId(cue.characterId) === characterId);
      const semanticControls = characterSfx.flatMap((cue) => SEMANTIC_CONTROLS[cue.semanticType]?.[characterId] ?? []);
      const requiredControls = unique([
        ...BASE_CONTROLS[characterId],
        ...(characterDialogue.length ? DIALOGUE_CONTROLS[characterId] : []),
        ...semanticControls,
      ]);
      const actionPrefix = characterId === 'CHAR_PIP_001' ? scene.pip.actionPrefix : scene.goat.actionPrefix;
      return {
        characterId,
        actionName: `${actionPrefix}EP001_${row.shotId}`,
        requiredCanonicalControls: requiredControls,
        dialogueLineIds: characterDialogue.map((cue) => cue.lineId),
        dialogueWindows: characterDialogue.map((cue) => ({
          lineId: cue.lineId,
          startFrame: cue.startFrame,
          endFrame: cue.endFrame,
          preRollFrames: cue.pictureHandles.preRollFrames,
          postRollFrames: cue.pictureHandles.postRollFrames,
          delivery: cue.delivery,
          realAudioBindingRequired: true as const,
        })),
        performanceMarkers: characterSfx.map((cue) => ({
          sfxEventId: cue.sfxEventId,
          semanticType: cue.semanticType,
          frame: cue.frame,
          durationFrames: cue.duration,
          syncTarget: cue.syncTarget,
          propId: cue.propId,
        })),
        sourcePackageRequired: true as const,
        adapterReceiptRequired: true as const,
        animationWritten: false as const,
      };
    });

    const body = {
      shotId: row.shotId,
      inFrame: row.inFrame,
      outFrame: row.outFrame,
      durationFrames: row.outFrame - row.inFrame,
      startSeconds: row.startSeconds,
      endSeconds: row.endSeconds,
      dialogueLineIds: row.dialogueLineIds,
      sfxEventIds: row.sfxEventIds,
      evidencedCharacters,
      characterPlans,
      unknownScenePresence: ['CHAR_PIP_001','CHAR_GOAT_001'].filter((id) => !evidencedCharacters.includes(id as CharacterId)),
      scenePresenceRule: 'Absence from dialogue/SFX evidence does not prove absence from picture; final shot blocking must bind actual visible presence from the canonical picture plan or human blocking review.' as const,
      audioCueSheetSha256: audio.cueSheetSha256,
      characterSceneIntegrationSha256: scene.ep001CharacterSceneIntegrationSha256,
      outputContract: {
        playblastKeyTemplate: `tivvlejoy-assets/episodes/EP001/shots/${row.shotId}/character-playblast.mp4`,
        animationManifestKeyTemplate: `tivvlejoy-assets/episodes/EP001/shots/${row.shotId}/character-animation-manifest.json`,
        reviewStillPrefixTemplate: `tivvlejoy-assets/episodes/EP001/shots/${row.shotId}/review-stills/`,
      },
      cacheBindingRequired: [
        'shotIntegrationSha256',
        'pipProductionPackageSha256',
        'goatProductionPackageSha256',
        'pipAdapterSha256',
        'goatAdapterSha256',
        'realVoiceReceiptHashes',
        'sceneryPackageSha256',
      ] as const,
      authority: {
        approvedCharacterPackagesBound: false as const,
        realAudioBound: false as const,
        sceneryAdmitted: false as const,
        animationExecutionAllowed: false as const,
        animationWritten: false as const,
        shotApproved: false as const,
      },
    };
    return { ...body, shotIntegrationSha256: sha256Canonical(body) };
  });

  const body = {
    schemaVersion: EP001_PER_SHOT_CHARACTER_INTEGRATION_SCHEMA,
    episodeId: 'EP001' as const,
    fps: 30 as const,
    totalFrames: audio.format.totalFrames,
    audioCueSheetSha256: audio.cueSheetSha256,
    characterSceneIntegrationSha256: scene.ep001CharacterSceneIntegrationSha256,
    shots,
    metrics: {
      shotCount: shots.length,
      dialogueLineCount: audio.dialogueCues.length,
      performanceMarkerCount: audio.sfxCues.filter((cue) => cue.characterId !== null).length,
      shotCharacterPlanCount: shots.reduce((total, shot) => total + shot.characterPlans.length, 0),
      executedShotCount: 0 as const,
      approvedShotCount: 0 as const,
    },
    globalRules: [
      'Real approved character package and exact adapter receipt must be bound before animation execution.',
      'Real approved voice receipt/timing must be bound before dialogue animation finalization.',
      'Scenery must be admitted before final blocking/render validation.',
      'Source character libraries remain read-only; animation is written only into episode scene overrides/actions.',
      'Character presence not evidenced by dialogue or character-specific SFX remains a blocking decision, never an inferred absence.',
      'Every shot cache invalidates when a character package, adapter, real voice receipt, scenery package, or shot integration hash changes.',
    ],
    authority: {
      blenderLaunched: false as const,
      animationExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
  };

  return { ...body, perShotCharacterIntegrationSha256: sha256Canonical(body) };
}

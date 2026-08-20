import { describe, expect, it } from 'vitest';
import { simulateSeason } from './tivvlejoy-production-studio/simulation';
import { createMemoryStore } from './tivvlejoy-production-persistence';
import {
  APPROVAL_AREAS,
  BEAT_TYPES,
  COMPOSITION_DEFECTS,
  CONVERSATION_MODES,
  DUCK_STATES,
  LIGHTING_INTENTS,
  MUSIC_ROLES,
  PACE_PROFILES,
  PREVIEW_LADDER,
  QUALITY_TARGETS,
  REVIEW_CATEGORIES,
  REVIEW_STATUSES,
  SFX_TYPES,
  SHOT_INTENTS,
  TIMING_CONFIDENCE,
  VFX_INTENTS,
  addDailiesNote,
  ambienceForLocation,
  analyzeCriticalPath,
  buildDailyQueue,
  buildEpisodeCreativeIntent,
  buildStoryBeats,
  buildVoiceTimingReceipt,
  compileDirectedEpisode,
  compileDirectorToRenderPackage,
  conversationModeFor,
  createRevisionRequest,
  durationForShot,
  emptyApprovalMatrix,
  estimateThroughput,
  evaluateAudioMixPlan,
  evaluateCaptionQc,
  evaluateChangeImpact,
  evaluateLightingContinuity,
  evaluateMasterReadiness,
  evaluateShotCompositionQc,
  evaluateVerticalComposition,
  humanBlockerLabel,
  persistDirectorPackage,
  planBudget,
  planCaptionCue,
  planCinematography,
  planCharacterStaging,
  planDailiesRenderLadder,
  planDialogueEdit,
  planDucking,
  planLightingDirection,
  planMusicCue,
  planSeasonSchedule,
  planSfxEvent,
  planVfxDirection,
  preventForwardStare,
  qualityTargetFor,
  recordApprovalArea,
  restoreDirectorHashes,
  sfxFromContacts,
  simulateNightshiftSeason,
  upgradeTimingConfidence,
  visemeConfidenceFor,
} from './tivvlejoy-nightshift-production';

const CHANGE_KINDS_LOCAL = [
  'VOICE_RECEIPT',
  'PIP_RIG',
  'GOAT_RIG',
  'SCENERY_ASSET',
  'CAMERA',
  'LIGHTING',
  'SHOT_DURATION',
  'CAPTION',
  'REVIEW_APPROVAL',
] as const;

describe('showrunner and beat depth', () => {
  for (const episodeNumber of [1, 7, 12, 30, 48, 60] as const) {
    it(`builds synthetic intent for episode ${episodeNumber} without a final script`, () => {
      const intent = buildEpisodeCreativeIntent({
        episodeId: `EP${String(episodeNumber).padStart(3, '0')}`,
        episodeNumber,
        primaryLocation: 'bakery',
        secondaryLocation: 'forest',
      });
      expect(intent.synthetic).toBe(true);
      expect(intent.episodeCreativeIntentSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(intent.episodeGoal.length).toBeGreaterThan(8);
      expect(JSON.stringify(intent)).not.toMatch(/DoodleDash/);
    });
  }

  for (const beatType of BEAT_TYPES) {
    it(`keeps ${beatType} duration and cut priority story-driven`, () => {
      const intent = buildEpisodeCreativeIntent({ episodeId: 'EP021', episodeNumber: 21 });
      const beat = buildStoryBeats({ intent, shotCount: 13 }).find((item) => item.beatType === beatType);
      expect(beat?.durationTarget).toBeGreaterThan(0);
      expect(['MUST_HOLD', 'FLEXIBLE', 'CUTTABLE']).toContain(beat?.cutPriority);
      expect(beat?.characters).toEqual(expect.arrayContaining(['PIP', 'GOAT']));
    });
  }
});

describe('cinematography and composition depth', () => {
  for (const intent of SHOT_INTENTS) {
    it(`maps ${intent} onto a quality target instead of one max-quality default`, () => {
      const target = qualityTargetFor(intent);
      expect(QUALITY_TARGETS).toContain(target);
      if (intent === 'LOCATION_TRANSITION') expect(target).toBe('TRANSITION_SHOT');
      if (intent === 'CLOSE_UP' || intent === 'REACTION') expect(target).toBe('DIALOGUE_CLOSEUP');
      if (intent === 'FOLLOW' || intent === 'TRACKING') expect(target).toBe('ACTION_SHOT');
    });
  }

  const defectFixtures: Array<{
    defect: (typeof COMPOSITION_DEFECTS)[number];
    subjects: Array<{ id: string; kind: 'FACE' | 'PROP' | 'GESTURE' | 'FEET' | 'SIGN' | 'ACTION_EXIT'; important: boolean; box: { x: number; y: number; w: number; h: number } }>;
    extras?: Partial<Parameters<typeof evaluateShotCompositionQc>[0]>;
    intent?: (typeof SHOT_INTENTS)[number];
  }> = [
    { defect: 'FACE_TOO_SMALL', subjects: [{ id: 'f', kind: 'FACE', important: true, box: { x: 0.4, y: 0.4, w: 0.05, h: 0.05 } }], intent: 'CLOSE_UP' },
    { defect: 'FACE_OUT_OF_SAFE_REGION', subjects: [{ id: 'f', kind: 'FACE', important: true, box: { x: 0.3, y: 0.02, w: 0.2, h: 0.1 } }], intent: 'CLOSE_UP' },
    { defect: 'PROP_NOT_READABLE', subjects: [{ id: 'p', kind: 'PROP', important: true, box: { x: 0.2, y: 0.86, w: 0.1, h: 0.05 } }], intent: 'PROP_INSERT' },
    { defect: 'GESTURE_OUT_OF_FRAME', subjects: [{ id: 'g', kind: 'GESTURE', important: true, box: { x: 0.9, y: 0.4, w: 0.2, h: 0.2 } }], extras: {}, intent: 'STATIC_COMEDY' },
    { defect: 'TOO_MUCH_EMPTY_SPACE', subjects: [{ id: 'f', kind: 'FACE', important: true, box: { x: 0.4, y: 0.4, w: 0.2, h: 0.12 } }], extras: { emptySpaceRatio: 0.9 }, intent: 'MEDIUM_SINGLE' },
    { defect: 'SCREEN_DIRECTION_AMBIGUOUS', subjects: [{ id: 'f', kind: 'FACE', important: true, box: { x: 0.4, y: 0.4, w: 0.2, h: 0.12 } }], extras: { screenDirectionAmbiguous: true }, intent: 'MEDIUM_TWO_SHOT' },
    { defect: 'SUBJECT_OVERLAP', subjects: [{ id: 'f', kind: 'FACE', important: true, box: { x: 0.4, y: 0.4, w: 0.2, h: 0.12 } }], extras: { subjectsOverlap: true }, intent: 'MEDIUM_TWO_SHOT' },
    { defect: 'BACKGROUND_COMPETES_WITH_FACE', subjects: [{ id: 'f', kind: 'FACE', important: true, box: { x: 0.4, y: 0.4, w: 0.2, h: 0.12 } }], extras: { backgroundCompetes: true }, intent: 'CLOSE_UP' },
    { defect: 'SIGNAGE_OCCLUDED', subjects: [{ id: 's', kind: 'SIGN', important: true, box: { x: -0.1, y: 0.02, w: 0.2, h: 0.1 } }], intent: 'ESTABLISHING' },
    { defect: 'ACTION_EXIT_NOT_VISIBLE', subjects: [{ id: 'e', kind: 'ACTION_EXIT', important: true, box: { x: 1.1, y: 0.4, w: 0.1, h: 0.1 } }], intent: 'FOLLOW' },
    { defect: 'CAPTION_COLLISION', subjects: [{ id: 'p', kind: 'PROP', important: true, box: { x: 0.2, y: 0.88, w: 0.5, h: 0.1 } }], extras: {}, intent: 'PROP_INSERT' },
    { defect: 'DEPTH_FLATTENED', subjects: [{ id: 'f', kind: 'FACE', important: true, box: { x: 0.4, y: 0.4, w: 0.2, h: 0.12 } }], extras: { depthFlattened: true }, intent: 'OVER_SHOULDER' },
  ];

  for (const fixture of defectFixtures) {
    it(`detects ${fixture.defect} from synthetic framing`, () => {
      const plan = planCinematography({
        shotId: `QC_${fixture.defect}`,
        intent: fixture.intent ?? 'MEDIUM_TWO_SHOT',
        speaker: 'PIP',
        prop: fixture.intent === 'PROP_INSERT' ? 'map' : null,
      });
      const composition = evaluateVerticalComposition({
        subjects: fixture.subjects,
        captionsEnabled: fixture.defect === 'CAPTION_COLLISION',
        locomotionImportant: fixture.defect === 'ACTION_EXIT_NOT_VISIBLE',
      });
      const qc = evaluateShotCompositionQc({
        plan,
        composition,
        subjects: fixture.subjects,
        ...fixture.extras,
      });
      expect(qc.defects).toContain(fixture.defect);
      expect(qc.passed).toBe(false);
    });
  }
});

describe('staging and screen-direction depth', () => {
  for (const mode of CONVERSATION_MODES) {
    it(`keeps ${mode} from robotic forward stare and overlap`, () => {
      const staging = planCharacterStaging({
        shotId: `ST_${mode}`,
        mode,
        travel: mode.includes('TRAVEL') || mode.includes('WALK') || mode.includes('LEADING') || mode.includes('FOLLOWING') ? 'RIGHT' : 'NONE',
        leading: mode === 'ONE_LEADING' ? 'PIP' : mode === 'ONE_FOLLOWING' ? 'GOAT' : undefined,
        prop: mode === 'MAP_READING',
      });
      const gaze = preventForwardStare(mode);
      expect(staging.overlap).toBe(false);
      expect(gaze.pipYaw === 0 && gaze.goatYaw === 0).toBe(false);
      expect(Math.abs(staging.pipZone.x - staging.goatZone.x)).toBeGreaterThan(0.05);
    });
  }

  it('prefers map-reading over speaker-only mode', () => {
    expect(conversationModeFor({ speaker: 'PIP', map: true })).toBe('MAP_READING');
    expect(conversationModeFor({ speaker: 'GOAT', jointReaction: true })).toBe('JOINT_REACTION');
    expect(conversationModeFor({ leading: 'PIP' })).toBe('ONE_LEADING');
  });
});

describe('lighting, VFX, and editorial depth', () => {
  for (const intent of LIGHTING_INTENTS) {
    it(`keeps ${intent} on native Blender storybook lighting`, () => {
      const plan = planLightingDirection({ shotId: `L_${intent}`, intent, heroProp: intent === 'GOLDEN_DISCOVERY' });
      expect(plan.gafferRequired).toBe(false);
      expect(plan.physicalStarlightRequired).toBe(false);
      expect(plan.nativeBlenderBaseline).toBe(true);
      expect(plan.faceReadability).toBe(true);
    });
  }

  it('allows a deliberate lighting reveal without requiring identical exposure', () => {
    const findings = evaluateLightingContinuity([
      planLightingDirection({ shotId: 'A', intent: 'WARM_INVITING' }),
      planLightingDirection({ shotId: 'B', intent: 'REVEAL_ACCENT' }),
    ]);
    expect(findings[0]?.allowed).toBe(true);
  });

  for (const type of VFX_INTENTS) {
    it(`plans ${type} as metadata with a cost class and no execution`, () => {
      const plan = planVfxDirection({ shotId: 'SH_VFX', type });
      expect(plan.executed).toBe(false);
      expect(plan.safety).toBe('CHILD_SAFE_CARTOON');
      expect(plan.vfxDependencySha256).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  for (const pace of PACE_PROFILES) {
    for (const intent of ['ESTABLISHING', 'REACTION', 'PROP_INSERT', 'FOLLOW'] as const) {
      it(`times ${intent} under ${pace} with configurable fps`, () => {
        const creative = buildEpisodeCreativeIntent({ episodeId: 'EP022', episodeNumber: 22 });
        const beat = buildStoryBeats({ intent: creative, shotCount: 4 })[0]!;
        const timing = durationForShot({ beat, intent, pace, dialogueFrames: intent === 'REACTION' ? 36 : null, fps: 24 });
        expect(timing.durationFrames).toBeGreaterThanOrEqual(timing.minimumReadableDuration);
        expect(timing.maximumHoldDuration).toBeGreaterThan(timing.minimumReadableDuration);
      });
    }
  }
});

describe('dialogue, captions, and sound depth', () => {
  for (const speaker of ['PIP', 'GOAT'] as const) {
    for (const comedy of [false, true] as const) {
      for (const interrupt of [false, true] as const) {
        it(`plans a ${speaker} line comedy=${comedy} interrupt=${interrupt} without synthesis`, () => {
          const receipt = buildVoiceTimingReceipt({
            dialogueRef: `${speaker}_L1`,
            speaker,
            lineDurationFrames: 42,
            words: ['look', 'there'],
          });
          const edit = planDialogueEdit({
            lineId: receipt.dialogueRef,
            speaker,
            shotId: 'SH_DL',
            pictureIn: 12,
            receipt,
            comedy,
            interrupt,
          });
          expect(edit.synthesized).toBe(false);
          expect(receipt.voiceIdChanged).toBe(false);
          expect(edit.endFrame).toBeGreaterThan(edit.startFrame);
          expect(edit.interruption).toBe(interrupt);
        });
      }
    }
  }

  for (const confidence of TIMING_CONFIDENCE) {
    it(`maps ${confidence} timing onto an explicit viseme confidence`, () => {
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(visemeConfidenceFor(confidence));
    });
  }

  it('upgrades LINE to WORD to PHONEME without touching scenery hashes', () => {
    let receipt = buildVoiceTimingReceipt({ dialogueRef: 'L9', speaker: 'PIP', lineDurationFrames: 30 });
    expect(receipt.confidence).toBe('LINE_LEVEL');
    receipt = upgradeTimingConfidence(
      buildVoiceTimingReceipt({ dialogueRef: 'L9', speaker: 'PIP', lineDurationFrames: 30, words: ['a', 'map'] }),
      'WORD_LEVEL',
    );
    expect(receipt.confidence).toBe('WORD_LEVEL');
    expect(visemeConfidenceFor(receipt.confidence)).toBe('MEDIUM');
    receipt = upgradeTimingConfidence(
      buildVoiceTimingReceipt({
        dialogueRef: 'L9',
        speaker: 'PIP',
        lineDurationFrames: 30,
        words: ['a', 'map'],
        phonemes: ['AH', 'M', 'AE', 'P'],
      }),
      'PHONEME_LEVEL',
    );
    expect(visemeConfidenceFor(receipt.confidence)).toBe('HIGH');
    expect(evaluateChangeImpact('VOICE_RECEIPT').preserves).toContain('scenery source inspection');
  });

  for (const speaker of ['PIP', 'GOAT'] as const) {
    it(`builds ${speaker} captions without rewriting dialogue`, () => {
      const cue = planCaptionCue({
        captionId: `C_${speaker}`,
        speaker,
        text: '  Look at the map.  ',
        startFrame: 10,
        endFrame: 40,
      });
      expect(cue.text).toBe('Look at the map.');
      expect(cue.text).not.toMatch(/DoodleDash/);
      expect(cue.safeRegion.bottom).toBeGreaterThan(0);
    });
  }

  it('flags caption overflow and shot-boundary misses', () => {
    const captions = [
      planCaptionCue({
        captionId: 'LONG',
        speaker: 'PIP',
        text: 'This line is deliberately far too long for two caption rows on a vertical frame and should overflow.',
        startFrame: 0,
        endFrame: 8,
      }),
      planCaptionCue({ captionId: 'LATE', speaker: 'GOAT', text: 'Wait.', startFrame: 90, endFrame: 120 }),
    ];
    const qc = evaluateCaptionQc({
      captions,
      shotRanges: [{ shotId: 'SH01', inFrame: 0, outFrame: 60 }],
    });
    expect(qc.passed).toBe(false);
    expect(qc.findings.map((item) => item.code)).toEqual(expect.arrayContaining(['READING_SPEED', 'SHOT_BOUNDARY']));
  });

  for (const type of SFX_TYPES) {
    it(`keeps ${type} as a metadata event without an audio binary`, () => {
      const event = planSfxEvent({
        sfxEventId: `E_${type}`,
        semanticType: type,
        frame: 12,
        duration: 6,
        intensity: 0.4,
        spatialRole: 'CENTER',
        characterId: type.startsWith('HOOF') ? 'GOAT' : 'PIP',
        propId: type.includes('MAP') ? 'map' : null,
        locationId: 'forest',
        priority: 'STORY',
      });
      expect(event.audioBinaryIncluded).toBe(false);
    });
  }

  for (const role of MUSIC_ROLES) {
    it(`plans ${role} music without copyrighted audio`, () => {
      const cue = planMusicCue({
        cueId: `M_${role}`,
        role,
        startFrame: 0,
        endFrame: 90,
        storyBeatRefs: ['BEAT_01'],
        dialoguePresent: role !== 'ENDING_BUTTON',
      });
      expect(cue.copyrightedAudioIncluded).toBe(false);
      expect(DUCK_STATES).toContain(cue.duckUnderDialogue);
    });
  }

  it('ducks music under dialogue and flags overcrowded SFX', () => {
    expect(planDucking({ dialogue: true })).toBe('MEDIUM_DUCK');
    expect(planDucking({ dialogue: true, sfxPriority: 'STORY' })).toBe('STRONG_DUCK');
    const mix = evaluateAudioMixPlan({
      dialogueClips: 2,
      duplicateDialogue: false,
      musicDuringDialogueUnDuck: true,
      sfxPerSecond: 9,
      ambienceGaps: 0,
      sfxDesync: false,
      pictureEnd: 120,
      audioEnd: 120,
      accidentalSilence: false,
    });
    expect(mix.measuredLoudness).toBe(false);
    expect(mix.findings.some((item) => item.code === 'SFX_NOT_OVERDENSE' && !item.passed)).toBe(true);
    expect(mix.findings.some((item) => item.code === 'MUSIC_UNDER_DIALOGUE' && !item.passed)).toBe(true);
    expect(ambienceForLocation('tavern', 'CLEAR', 'NIGHT_COZY')).toBeTruthy();
  });
});

describe('dailies, impact, and readiness depth', () => {
  for (const status of REVIEW_STATUSES) {
    it(`records a ${status} dailies note without auto-approval`, () => {
      const note = addDailiesNote({
        reviewId: `S_${status}`,
        shotId: 'SH10',
        shotDependencySha256: 'dd'.repeat(32),
        reviewerClass: 'HUMAN',
        reviewCategory: 'EDIT',
        note: 'Check the hold.',
        severity: 'WARNING',
        frameRange: { start: 4, end: 16 },
        createdAt: '1970-01-01T00:00:00.000Z',
        resolvedByRevision: null,
        status,
      });
      expect(note.autoApproved).toBe(false);
      expect(note.status).toBe(status);
    });
  }

  for (const category of REVIEW_CATEGORIES) {
    it(`turns a ${category} note into a revision that names dependency impact`, () => {
      const note = addDailiesNote({
        reviewId: `REV_${category}`,
        shotId: 'SH11',
        shotDependencySha256: 'ee'.repeat(32),
        reviewerClass: 'HUMAN',
        reviewCategory: category,
        note: 'Hold Goat reaction 12 frames longer.',
        severity: 'MUST_FIX',
        frameRange: { start: 8, end: 20 },
        createdAt: '1970-01-01T00:00:00.000Z',
        resolvedByRevision: null,
      });
      const revision = createRevisionRequest({
        note,
        instruction: note.note,
        requestedDeltaFrames: 12,
        fromRevisionId: 'SHOT_V1',
      });
      expect(revision.selectedBinding).not.toBe('latest');
      expect(revision.doesNotInvalidate.length).toBeGreaterThan(0);
      expect(revision.impacts.length).toBeGreaterThan(0);
      expect(revision.doesNotInvalidate.join(' ')).not.toMatch(/\blatest\b/);
      if (category !== 'SCENERY') {
        expect(revision.doesNotInvalidate.join(' ')).toMatch(/scenery|voice|dialogue|asset/i);
      }
    });
  }

  for (const kind of CHANGE_KINDS_LOCAL) {
    it(`maps ${kind} to a minimal invalidation set`, () => {
      const impact = evaluateChangeImpact(kind);
      expect(impact.invalidates.length).toBeGreaterThan(0);
      expect(impact.preserves.length).toBeGreaterThan(0);
      expect(impact.impactSha256).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  for (const area of APPROVAL_AREAS) {
    it(`keeps ${area} from becoming a real final`, () => {
      const matrix = recordApprovalArea(emptyApprovalMatrix('SH12'), area, true);
      expect(matrix.finalApproved).toBe(false);
      expect(matrix.syntheticCannotFinalize).toBe(true);
    });
  }

  it('never lets caption polish outrank a missing production rig', () => {
    const path = analyzeCriticalPath({ missingRig: true, captionPolishOnly: true });
    expect(path.delayCode).toBe('MISSING_CHARACTER_RIG');
    expect(path.captionPolishOutranksRig).toBe(false);
    expect(humanBlockerLabel(path.delayCode)).toMatch(/Pip or Goat production rig/);
  });

  it('forecasts throughput from caller capacities only', () => {
    const low = estimateThroughput({});
    expect(low.confidence).toBe('LOW_CONFIDENCE');
    expect(low.assumedStaffInvented).toBe(false);
    expect(low.promise).toBe(false);
    const high = estimateThroughput({ reviewCapacity: 4, animationCapacity: 3, renderCapacity: 2, voiceCapacity: 5 });
    expect(high.confidence).toBe('HIGH_CONFIDENCE');
    expect(high.conceptualEpisodesPerCycle).toBe(2);
  });

  it('plans the preview-to-final ladder without executing FINAL', () => {
    const ladder = planDailiesRenderLadder();
    expect(ladder.map((rung) => rung.level)).toEqual([...PREVIEW_LADDER]);
    expect(ladder.every((rung) => rung.executed === false && rung.paidAuthorizationIssued === false)).toBe(true);
    expect(ladder.find((rung) => rung.level === 'FINAL')?.costClass).toBe('PAID_FINAL');
    expect(planSeasonSchedule(60).executed).toBe(false);
    expect(planBudget({ rates: { RENDER: 10 } }).authorizationIssued).toBe(false);
    expect(buildDailyQueue({ blocked: ['RIG'], ready: ['DIR01', 'EDIT01'] }).blockedNotScheduled).toEqual(['RIG']);
  });
});

describe('integration, persistence, and scale', () => {
  it('compiles a director-to-render package without paid authorization', () => {
    const season = simulateSeason({ episodeCount: 1, shotsPerEpisode: 4 });
    const compiled = compileDirectedEpisode(season.episodes[0]!);
    const pack = compileDirectorToRenderPackage({
      spec: compiled.compiledShots[0]!.finalSpec,
      animationManifestSha256: 'aa'.repeat(32),
      sceneryResolutionSha256: 'bb'.repeat(32),
      visualApprovalFresh: true,
      renderPreflightFresh: true,
    });
    expect(pack.paidAuthorizationIssued).toBe(false);
    expect(pack.readyForPaidAuthorization).toBe(true);
    expect(evaluateMasterReadiness({ packages: [compiled.directorPackage] }).state).not.toBe('PRODUCTION_READY');
  });

  it('surfaces director/editor/review tab conflicts instead of silent overwrite', () => {
    const season = simulateSeason({ episodeCount: 1, shotsPerEpisode: 4 });
    const compiled = compileDirectedEpisode(season.episodes[0]!);
    const store = createMemoryStore({ workspaceId: 'ws_tabs' });
    persistDirectorPackage(store, compiled.directorPackage);
    const director = store.writeRecord({
      entityType: 'DIRECTOR_PACKAGE',
      entityId: compiled.episodeId,
      payload: { sha256: compiled.directorPackage.episodeDirectorPackageSha256, tab: 'director' },
      expectedRevision: store.getRevision(),
      eventType: 'DIRECTOR_PACKAGE_COMPILED',
      reason: 'director tab',
    });
    const staleEditor = store.writeRecord({
      entityType: 'EDITORIAL_TIMELINE',
      entityId: compiled.episodeId,
      payload: { sha256: '11'.repeat(32), tab: 'editor' },
      expectedRevision: 0,
      eventType: 'EDIT_TIMELINE_CREATED',
      reason: 'stale editor tab',
    });
    const staleReview = store.writeRecord({
      entityType: 'DAILIES_REVIEW',
      entityId: compiled.episodeId,
      payload: { sha256: '22'.repeat(32), tab: 'review' },
      expectedRevision: 0,
      eventType: 'REVIEW_NOTE_ADDED',
      reason: 'stale review tab',
    });
    expect(['WRITE_ACCEPTED', 'WRITE_IDEMPOTENT']).toContain(director.result);
    expect(['WRITE_CONFLICT', 'WRITE_STALE']).toContain(staleEditor.result);
    expect(['WRITE_CONFLICT', 'WRITE_STALE']).toContain(staleReview.result);
  });

  it('recovers an interrupted persist by replacing store state', () => {
    const season = simulateSeason({ episodeCount: 1, shotsPerEpisode: 6 });
    const compiled = compileDirectedEpisode(season.episodes[0]!);
    const store = createMemoryStore({ workspaceId: 'ws_recover' });
    persistDirectorPackage(store, compiled.directorPackage);
    const recovered = createMemoryStore({ workspaceId: 'ws_recover_2' });
    recovered.replaceState(store.view());
    expect(restoreDirectorHashes(recovered)).toEqual(restoreDirectorHashes(store));
  });

  it('repeats compilation with identical inputs and matching hashes', () => {
    const season = simulateSeason({ episodeCount: 1, shotsPerEpisode: 8 });
    const a = compileDirectedEpisode(season.episodes[0]!);
    const b = compileDirectedEpisode(season.episodes[0]!);
    expect(a.directorPackage.episodeDirectorPackageSha256).toBe(b.directorPackage.episodeDirectorPackageSha256);
    expect(a.compiledShots.map((shot) => shot.finalSpec.finalShotSpecSha256)).toEqual(
      b.compiledShots.map((shot) => shot.finalSpec.finalShotSpecSha256),
    );
  });

  it('scales a 100-episode / 1200-shot software compile without claiming readiness', () => {
    const started = Date.now();
    const sim = simulateNightshiftSeason({ episodeCount: 100, shotsPerEpisode: 12 });
    expect(sim.episodes).toBe(100);
    expect(sim.shots).toBe(1200);
    expect(sim.directorPackages).toBe(100);
    expect(sim.finalShotSpecs).toBe(1200);
    expect(sim.readinessState).not.toBe('PRODUCTION_READY');
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(sfxFromContacts({ shotId: 'S', frame: 1, locationId: 'bakery', pipFoot: true }).length).toBeGreaterThan(0);
  });
});

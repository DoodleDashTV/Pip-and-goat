/**
 * Regression fixtures and the local validation scene.
 *
 * All of it derived from committed, already-accepted evidence — nothing here
 * required a new render. The accepted FINAL_1080P evidence in particular is
 * reproduced as constants so a test can assert it is still intact without reading
 * an artifact that may not be present locally (the mp4 is LFS-backed).
 */
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { SCENE_PLAN_SCHEMA_VERSION } from './versions';
import { ScenePlanSchema, type ScenePlan } from './schema/scene-plan';

/**
 * The closed FINAL_1080P acceptance. Preserved, never re-derived.
 *
 * Asserted by the regression suite so that a change to the direction layer which
 * would invalidate the accepted render fails a test instead of a review.
 */
export const FINAL_1080P_ACCEPTANCE = {
  workerImageDigest: 'sha256:8204d4bffdc2d28dee6c313fc571e6fb5e3831a3d8ff241a29a536963ec1f830',
  acceptedArtifactSha256: 'aefdd0b05881d336c489ba984a891f04eec0a44e889c6b3b3f61002554655458',
  approvedCharacterAssetsFingerprint: '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7',
  renderCodeFingerprint: 'a4018c0e443e906aab20fb45527d25f5f91984cb041d3bca020d557dd7b32f3a',
  workerSourceCommit: 'da26bc16806513e7ba58ceb3408728df7712622f',
  resolution: '1080x1920',
  frames: 90,
  fps: 30,
  codec: 'H.264',
  chestSeamRepair: 'PASS',
  prNumber: 10,
  mergeCommit: '1ff46d595023ede5a33aa9e7f12cbbebe5ec9ed1',
} as const;

/**
 * The accepted Meadow Map Mystery composition, as a **regression fixture**.
 *
 * This is what the accepted acceptance render used. It is pinned so that the
 * projection layer can be checked against it, and it is explicitly *not* a
 * mandatory composition for future shots: the camera system is free to choose
 * differently for a different beat, and it does.
 */
export const MEADOW_MAP_MYSTERY_ACCEPTED_SHOT_META = {
  title: 'Meadow Map Mystery — local acceptance',
  cameraPreset: 'PUSH_IN',
  lightingState: 'DAY_KEY',
  placements: {
    map: { location: [0.0, -2.3, 0.0], rotation: [0.0, 0.0, 0.0] },
    pip: { location: [-0.72, -1.62, 0.0], rotation: [0.0, 0.0, 0.5], action: 'PIP_POINT' },
    goat: { location: [0.78, -1.42, 0.0], rotation: [0.0, 0.0, -0.56], action: 'GOAT_HEAD_NOD' },
  },
} as const;

/** Shadow-caster constants the chest-seam repair depends on. Asserted, not used. */
export const SHADOW_CASTER_CONSTANTS = {
  SHADOW_PROXY_SHRINK: 0.022,
  SHADOW_PROXY_SAFE_FRACTION: 0.5,
  SHADOW_PROXY_MIN_ROOM: 0.001,
  SHADOW_PROXY_VERTEX_GROUP: 'DDP_ShadowShrink',
  SHADOW_PROXY_SELF_REACH: 1.0,
  SHADOW_PROXY_SELF_SHARE: 0.5,
  SHADOW_PROXY_SELF_SAMPLES: 64,
  SHADOW_PROXY_SEALED_CLEARANCE: 0.0001,
  SHADOW_PROXY_SUFFIX: '_ShadowProxy',
} as const;

/**
 * The local validation scene: 12 seconds, Pip and Goat, four beats, exercising all
 * eight systems.
 *
 * Draft resolution by design. It is a capability fixture, not an acceptance render,
 * and it must never be presented as one.
 */
export const VALIDATION_SCENE_PLAN: ScenePlan = ScenePlanSchema.parse({
  planVersion: SCENE_PLAN_SCHEMA_VERSION,
  episodeId: 'VALIDATION_STEPS_1_8',
  episodeTitle: 'Steps 1-8 Validation — Meadow Map Glimmer',
  // Fixed seed: this fixture's whole purpose is to be reproducible.
  seed: 'tivvlejoy-steps-1-8-validation-seed-v1',
  storyApproved: true,
  approvedGatedEmotions: [],
  delivery: { aspect: '9:16', resolution: '360x640', fps: 30, targetDurationSeconds: 12 },
  beats: [
    {
      beatId: 'B1_HOOK',
      purpose: 'HOOK',
      summary: 'Pip spots a faint glimmer at the edge of the map and leans in to study it',
      locationId: 'LOC_MEADOW_001',
      timeOfDay: 'MIDDAY',
      durationSeconds: 2.5,
      characters: [
        {
          characterCode: FOUNDING_CODES.PIP,
          objective: 'show Goat the strange mark she can see on the map',
          emotion: 'curious',
          focus: true,
        },
        { characterCode: FOUNDING_CODES.GOAT, objective: 'listen and look where Pip is looking', focus: false },
      ],
      dialogue: [
        { lineId: 'L1', characterCode: FOUNDING_CODES.PIP, text: 'Goat, look at this little mark.', intent: 'draw attention' },
      ],
      requiredProps: ['PROP_MAP_001'],
      continuityRefs: [],
      vfxRequests: ['vfx_map_glow_v1'],
      musicIntent: 'CURIOUS',
    },
    {
      beatId: 'B2_DISCOVERY',
      purpose: 'DISCOVERY',
      summary: 'The mark glows and both of them react with delight',
      locationId: 'LOC_MEADOW_001',
      timeOfDay: 'MIDDAY',
      durationSeconds: 3,
      characters: [
        { characterCode: FOUNDING_CODES.PIP, objective: 'understand what the glow means', emotion: 'surprised', focus: true },
        { characterCode: FOUNDING_CODES.GOAT, objective: 'share the discovery with Pip', emotion: 'excited', focus: false },
      ],
      dialogue: [
        { lineId: 'L2', characterCode: FOUNDING_CODES.GOAT, text: 'It is glowing!', intent: 'react' },
      ],
      requiredProps: ['PROP_MAP_001'],
      continuityRefs: ['B1_HOOK'],
      vfxRequests: ['vfx_discovery_burst_v1'],
      musicIntent: 'WONDER',
    },
    {
      beatId: 'B3_TURN',
      purpose: 'TURN',
      summary: 'They walk together toward the creek the glowing mark points to',
      locationId: 'LOC_MEADOW_001',
      timeOfDay: 'AFTERNOON',
      durationSeconds: 3.5,
      characters: [
        { characterCode: FOUNDING_CODES.PIP, objective: 'walk toward the creek to find what the map means', emotion: 'determined', focus: true },
        { characterCode: FOUNDING_CODES.GOAT, objective: 'follow Pip and keep pace', emotion: 'happy', focus: false },
      ],
      dialogue: [
        { lineId: 'L3', characterCode: FOUNDING_CODES.PIP, text: 'Come on, it is this way.', intent: 'lead' },
      ],
      requiredProps: [],
      continuityRefs: ['B2_DISCOVERY'],
      vfxRequests: [],
      musicIntent: 'PLAYFUL',
    },
    {
      beatId: 'B4_PAYOFF',
      purpose: 'PAYOFF',
      summary: 'They arrive and share a quiet, pleased look at what they found',
      locationId: 'LOC_CREEK_001',
      timeOfDay: 'GOLDEN_HOUR',
      durationSeconds: 3,
      characters: [
        { characterCode: FOUNDING_CODES.PIP, objective: 'enjoy having solved it with her friend', emotion: 'proud', focus: true },
        { characterCode: FOUNDING_CODES.GOAT, objective: 'celebrate with Pip', emotion: 'laughing', focus: false },
      ],
      dialogue: [
        { lineId: 'L4', characterCode: FOUNDING_CODES.GOAT, text: 'We found it together.', intent: 'affirm' },
      ],
      requiredProps: [],
      continuityRefs: ['B3_TURN'],
      vfxRequests: ['vfx_magic_sparkles_v1'],
      musicIntent: 'TRIUMPH',
    },
  ],
});

/**
 * A scene plan that must fail closed.
 *
 * Fault-injection fixture: an unapproved story, an unapproved gated emotion, a
 * duration that does not fit its slot, and no payoff. Each of those is a separate
 * refusal, and a test that expects all four proves the director does not degrade
 * gracefully into producing something wrong.
 */
export const FAULTY_SCENE_PLAN_INPUT = {
  planVersion: SCENE_PLAN_SCHEMA_VERSION,
  episodeId: 'VALIDATION_FAULT',
  episodeTitle: 'Fault injection',
  seed: 'fault-seed-v1',
  storyApproved: false,
  approvedGatedEmotions: [],
  delivery: { aspect: '9:16', resolution: '360x640', fps: 30, targetDurationSeconds: 30 },
  beats: [
    {
      beatId: 'F1',
      purpose: 'SETUP',
      summary: 'An angry confrontation nobody approved',
      locationId: 'LOC_MEADOW_001',
      timeOfDay: 'MIDDAY',
      durationSeconds: 2,
      characters: [{ characterCode: FOUNDING_CODES.PIP, objective: 'shout at Goat', emotion: 'angry', focus: true }],
      dialogue: [],
      requiredProps: [],
      continuityRefs: ['DOES_NOT_EXIST'],
      vfxRequests: ['vfx_not_in_registry_v9'],
      musicIntent: 'GENTLE_TENSION',
    },
  ],
} as const;

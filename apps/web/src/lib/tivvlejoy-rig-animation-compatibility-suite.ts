import { createHash } from 'node:crypto';
import { canonicalControlsFor, type AdapterCharacterId } from './tivvlejoy-rig-control-adapter';

export const TIVVLEJOY_RIG_ANIMATION_COMPATIBILITY_SCHEMA = 'TIVVLEJOY_RIG_ANIMATION_COMPATIBILITY_V1' as const;

export type CompatibilityTest = {
  id: string;
  label: string;
  characterId: AdapterCharacterId;
  durationFrames: number;
  requiredControls: readonly string[];
  acceptance: readonly string[];
  evidenceKinds: readonly string[];
};

function pipTests(): CompatibilityTest[] {
  const characterId: AdapterCharacterId = 'CHAR_PIP_001';
  return [
    { id: 'PIP_NEUTRAL', label: 'Neutral / bind sanity', characterId, durationFrames: 30, requiredControls: ['MASTER','ROOT','COG','BODY','CHEST','HEAD','NECK'], acceptance: ['No mesh explosions or control offsets','Silhouette matches approved character','Scarf/backpack/crest remain stable'], evidenceKinds: ['TURNAROUND','DEFORMATION_CLOSEUPS'] },
    { id: 'PIP_IDLE', label: 'Idle settle', characterId, durationFrames: 90, requiredControls: ['COG','BODY','CHEST','HEAD','WING_L','WING_R'], acceptance: ['No jitter or drifting root','Subtle breathing does not collapse chest/neck','Accessories remain attached'], evidenceKinds: ['IDLE'] },
    { id: 'PIP_WALK', label: 'Walk cycle', characterId, durationFrames: 48, requiredControls: ['ROOT','COG','LEG_IK_L','LEG_IK_R','FOOT_L','FOOT_R','TOE_L','TOE_R','HALLUX_L','HALLUX_R'], acceptance: ['No foot sliding at planted contacts','Rear hallux remains planted when expected','Hips and body transfer weight cleanly'], evidenceKinds: ['WALK','DEFORMATION_CLOSEUPS'] },
    { id: 'PIP_RUN', label: 'Run cycle', characterId, durationFrames: 36, requiredControls: ['ROOT','COG','BODY','LEG_IK_L','LEG_IK_R','FOOT_L','FOOT_R','WING_L','WING_R'], acceptance: ['No limb pops at speed','Wing/body overlap stays readable','Backpack straps do not detach or invert'], evidenceKinds: ['RUN'] },
    { id: 'PIP_TURN', label: '180 degree turn', characterId, durationFrames: 45, requiredControls: ['ROOT','MASTER','COG','BODY','HEAD','LEG_IK_L','LEG_IK_R'], acceptance: ['Root rotation is clean','Feet do not skate','Head/body counter-motion remains stable'], evidenceKinds: ['TURN'] },
    { id: 'PIP_JUMP', label: 'Jump and landing', characterId, durationFrames: 60, requiredControls: ['ROOT','COG','BODY','LEG_IK_L','LEG_IK_R','FOOT_L','FOOT_R','TOE_L','TOE_R'], acceptance: ['Compression/extension deforms cleanly','Landing contacts do not penetrate floor','No knee/ankle inversion'], evidenceKinds: ['JUMP','DEFORMATION_CLOSEUPS'] },
    { id: 'PIP_DIALOGUE', label: 'Dialogue articulation', characterId, durationFrames: 120, requiredControls: ['HEAD','EYE_AIM','BLINK_L','BLINK_R','BEAK_UPPER','BEAK_LOWER'], acceptance: ['Beak opens without face tearing','Eye direction remains independent','Dialogue motion preserves character appeal'], evidenceKinds: ['DIALOGUE'] },
    { id: 'PIP_EYES_BLINK', label: 'Eye aim and blink', characterId, durationFrames: 60, requiredControls: ['EYE_L','EYE_R','EYE_AIM','BLINK_L','BLINK_R'], acceptance: ['Both eyes track together when intended','Independent eye offsets remain possible','Lids close cleanly over eyes'], evidenceKinds: ['BLINK_EYES'] },
    { id: 'PIP_EXPRESSIONS', label: 'Expression range', characterId, durationFrames: 120, requiredControls: ['HEAD','EYE_AIM','BLINK_L','BLINK_R','BEAK_UPPER','BEAK_LOWER'], acceptance: ['Neutral, happy, curious/confused, and surprised read clearly','No expression collapses cheek/beak silhouette'], evidenceKinds: ['EXPRESSIONS'] },
    { id: 'PIP_WING_GESTURE', label: 'Wing gesture range', characterId, durationFrames: 90, requiredControls: ['WING_L','WING_R','BODY','CHEST'], acceptance: ['Wings gesture independently','Wing roots do not pinch or tear','Pointing/reaching arcs remain readable'], evidenceKinds: ['DEFORMATION_CLOSEUPS'] },
    { id: 'PIP_PROP_MAP', label: 'Map hold and handoff', characterId, durationFrames: 120, requiredControls: ['WING_L','WING_R','PROP_ATTACH','HEAD','EYE_AIM'], acceptance: ['Map can be held naturally','Prop follows attachment without lag','Both wings can release/regrip without snapping'], evidenceKinds: ['PROP_INTERACTION'] },
    { id: 'PIP_FOOT_STRESS', label: 'Foot / toe / hallux stress', characterId, durationFrames: 90, requiredControls: ['FOOT_L','FOOT_R','TOE_L','TOE_R','HALLUX_L','HALLUX_R'], acceptance: ['Toe curls preserve volume','Rear hallux does not collapse','Ground contacts remain plausible'], evidenceKinds: ['DEFORMATION_CLOSEUPS'] },
    { id: 'PIP_FULL_PERFORMANCE', label: 'Combined performance stress', characterId, durationFrames: 180, requiredControls: canonicalControlsFor(characterId).map((c) => c.canonicalId), acceptance: ['No control conflicts in combined acting','No clipping/collapse under locomotion plus dialogue','Rig remains animator-friendly through full-body performance'], evidenceKinds: ['TURNAROUND','DIALOGUE','PROP_INTERACTION'] },
  ];
}

function goatTests(): CompatibilityTest[] {
  const characterId: AdapterCharacterId = 'CHAR_GOAT_001';
  return [
    { id: 'GOAT_NEUTRAL', label: 'Neutral / bind sanity', characterId, durationFrames: 30, requiredControls: ['MASTER','ROOT','COG','BODY','CHEST','HEAD','NECK'], acceptance: ['No mesh explosions or control offsets','Silhouette matches approved character','Horns/collar/tag remain stable'], evidenceKinds: ['TURNAROUND','DEFORMATION_CLOSEUPS'] },
    { id: 'GOAT_IDLE', label: 'Idle settle', characterId, durationFrames: 90, requiredControls: ['COG','BODY','CHEST','HEAD'], acceptance: ['No root drift','Chest/neck deformation remains clean','Collar/tag do not jitter'], evidenceKinds: ['IDLE'] },
    { id: 'GOAT_WALK', label: 'Walk cycle', characterId, durationFrames: 48, requiredControls: ['ROOT','COG','LEG_IK_L','LEG_IK_R','HOOF_L','HOOF_R'], acceptance: ['No hoof sliding','Weight transfer reads clearly','Leg joints do not collapse'], evidenceKinds: ['WALK','DEFORMATION_CLOSEUPS'] },
    { id: 'GOAT_RUN', label: 'Run cycle', characterId, durationFrames: 36, requiredControls: ['ROOT','COG','BODY','LEG_IK_L','LEG_IK_R','HOOF_L','HOOF_R'], acceptance: ['No limb pops at speed','Hoof contacts remain stable','Collar/tag remain attached'], evidenceKinds: ['RUN'] },
    { id: 'GOAT_TURN', label: '180 degree turn', characterId, durationFrames: 45, requiredControls: ['ROOT','MASTER','COG','BODY','HEAD','LEG_IK_L','LEG_IK_R'], acceptance: ['Root turn is clean','No hoof skating','Head/body counter-motion remains stable'], evidenceKinds: ['TURN'] },
    { id: 'GOAT_JUMP', label: 'Jump and landing', characterId, durationFrames: 60, requiredControls: ['ROOT','COG','BODY','LEG_IK_L','LEG_IK_R','HOOF_L','HOOF_R'], acceptance: ['Compression and landing deform cleanly','No hoof floor penetration','No knee/hock inversion'], evidenceKinds: ['JUMP','DEFORMATION_CLOSEUPS'] },
    { id: 'GOAT_DIALOGUE', label: 'Dialogue articulation', characterId, durationFrames: 120, requiredControls: ['HEAD','EYE_AIM','BLINK','JAW','MOUTH'], acceptance: ['Jaw opens without muzzle tearing','Mouth controls support readable dialogue','Eyes remain independently aimable'], evidenceKinds: ['DIALOGUE'] },
    { id: 'GOAT_EYES_BLINK', label: 'Eye aim and blink', characterId, durationFrames: 60, requiredControls: ['EYE_L','EYE_R','EYE_AIM','BLINK'], acceptance: ['Eyes track without crossing unintentionally','Blink closes cleanly','Look-at remains stable during head turns'], evidenceKinds: ['BLINK_EYES'] },
    { id: 'GOAT_EXPRESSIONS', label: 'Expression range', characterId, durationFrames: 120, requiredControls: ['HEAD','EYE_AIM','BLINK','JAW','MOUTH'], acceptance: ['Neutral, happy, curious/confused, and surprised read clearly','Muzzle volume remains stable'], evidenceKinds: ['EXPRESSIONS'] },
    { id: 'GOAT_PROP', label: 'Prop interaction', characterId, durationFrames: 120, requiredControls: ['PROP_ATTACH','HEAD','EYE_AIM','BODY'], acceptance: ['Prop attachment is stable','Head/body can react independently','No collar/tag collision becomes distracting'], evidenceKinds: ['PROP_INTERACTION'] },
    { id: 'GOAT_FULL_PERFORMANCE', label: 'Combined performance stress', characterId, durationFrames: 180, requiredControls: canonicalControlsFor(characterId).map((c) => c.canonicalId), acceptance: ['No control conflicts in locomotion plus dialogue','No clipping/collapse under combined acting','Rig remains animator-friendly through full-body performance'], evidenceKinds: ['TURNAROUND','DIALOGUE','PROP_INTERACTION'] },
  ];
}

export function compileRigAnimationCompatibilitySuite() {
  const pip = pipTests();
  const goat = goatTests();
  const suite = {
    schemaVersion: TIVVLEJOY_RIG_ANIMATION_COMPATIBILITY_SCHEMA,
    blenderTarget: '4.2',
    fps: 30,
    pip,
    goat,
    totalTests: pip.length + goat.length,
    testsExecutableWithoutRealRig: false as const,
    syntheticPassCannotApprove: true as const,
    humanApprovalRequired: true as const,
    productionEnabled: false as const,
  };
  const suiteSha256 = createHash('sha256').update(JSON.stringify(suite)).digest('hex');
  return { ...suite, suiteSha256 };
}

export function validateCompatibilityAgainstAdapter(input: {
  characterId: AdapterCharacterId;
  mappedCanonicalControls: readonly string[];
}) {
  const tests = input.characterId === 'CHAR_PIP_001' ? pipTests() : goatTests();
  const available = new Set(input.mappedCanonicalControls);
  const rows = tests.map((test) => {
    const missingControls = test.requiredControls.filter((control) => !available.has(control));
    return { testId: test.id, runnable: missingControls.length === 0, missingControls };
  });
  return {
    characterId: input.characterId,
    rows,
    runnableCount: rows.filter((row) => row.runnable).length,
    totalTests: rows.length,
    allRunnable: rows.every((row) => row.runnable),
    executedTests: 0,
    passedTests: 0,
    humanApproved: false as const,
    productionEnabled: false as const,
  };
}

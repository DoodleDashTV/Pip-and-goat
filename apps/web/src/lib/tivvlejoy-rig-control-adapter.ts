import { createHash } from 'node:crypto';

export const TIVVLEJOY_RIG_CONTROL_ADAPTER_SCHEMA = 'TIVVLEJOY_RIG_CONTROL_ADAPTER_V1' as const;

export type AdapterCharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';
export type CanonicalControl = {
  canonicalId: string;
  label: string;
  required: true;
  category: 'GLOBAL' | 'BODY' | 'FACE' | 'LIMB' | 'PROP';
  aliases: readonly string[];
};

const PIP_CONTROLS: CanonicalControl[] = [
  { canonicalId: 'ROOT', label: 'Root', required: true, category: 'GLOBAL', aliases: ['root', 'root_ctrl', 'global_root'] },
  { canonicalId: 'MASTER', label: 'Master', required: true, category: 'GLOBAL', aliases: ['master', 'master_ctrl', 'global', 'global_ctrl'] },
  { canonicalId: 'COG', label: 'Center of gravity', required: true, category: 'BODY', aliases: ['cog', 'hips_ctrl', 'pelvis_ctrl'] },
  { canonicalId: 'BODY', label: 'Body', required: true, category: 'BODY', aliases: ['body', 'body_ctrl', 'torso_ctrl'] },
  { canonicalId: 'CHEST', label: 'Chest', required: true, category: 'BODY', aliases: ['chest', 'chest_ctrl', 'upper_torso_ctrl'] },
  { canonicalId: 'HEAD', label: 'Head', required: true, category: 'BODY', aliases: ['head', 'head_ctrl'] },
  { canonicalId: 'NECK', label: 'Neck', required: true, category: 'BODY', aliases: ['neck', 'neck_ctrl'] },
  { canonicalId: 'EYE_L', label: 'Left eye', required: true, category: 'FACE', aliases: ['eye_l', 'eye.L', 'left_eye_ctrl'] },
  { canonicalId: 'EYE_R', label: 'Right eye', required: true, category: 'FACE', aliases: ['eye_r', 'eye.R', 'right_eye_ctrl'] },
  { canonicalId: 'EYE_AIM', label: 'Eye aim', required: true, category: 'FACE', aliases: ['eyes_aim', 'eye_target', 'look_at'] },
  { canonicalId: 'BLINK_L', label: 'Left blink', required: true, category: 'FACE', aliases: ['blink_l', 'lid_l', 'eyelid_l'] },
  { canonicalId: 'BLINK_R', label: 'Right blink', required: true, category: 'FACE', aliases: ['blink_r', 'lid_r', 'eyelid_r'] },
  { canonicalId: 'BEAK_UPPER', label: 'Upper beak', required: true, category: 'FACE', aliases: ['beak_upper', 'upper_beak', 'beak_top_ctrl'] },
  { canonicalId: 'BEAK_LOWER', label: 'Lower beak', required: true, category: 'FACE', aliases: ['beak_lower', 'lower_beak', 'jaw_ctrl'] },
  { canonicalId: 'WING_L', label: 'Left wing', required: true, category: 'LIMB', aliases: ['wing_l', 'wing.L', 'left_wing_ctrl'] },
  { canonicalId: 'WING_R', label: 'Right wing', required: true, category: 'LIMB', aliases: ['wing_r', 'wing.R', 'right_wing_ctrl'] },
  { canonicalId: 'LEG_IK_L', label: 'Left leg IK', required: true, category: 'LIMB', aliases: ['leg_ik_l', 'foot_ik_l', 'leg.L.ik'] },
  { canonicalId: 'LEG_IK_R', label: 'Right leg IK', required: true, category: 'LIMB', aliases: ['leg_ik_r', 'foot_ik_r', 'leg.R.ik'] },
  { canonicalId: 'FOOT_L', label: 'Left foot', required: true, category: 'LIMB', aliases: ['foot_l', 'foot.L', 'left_foot_ctrl'] },
  { canonicalId: 'FOOT_R', label: 'Right foot', required: true, category: 'LIMB', aliases: ['foot_r', 'foot.R', 'right_foot_ctrl'] },
  { canonicalId: 'TOE_L', label: 'Left toes', required: true, category: 'LIMB', aliases: ['toe_l', 'toes_l', 'toe.L'] },
  { canonicalId: 'TOE_R', label: 'Right toes', required: true, category: 'LIMB', aliases: ['toe_r', 'toes_r', 'toe.R'] },
  { canonicalId: 'HALLUX_L', label: 'Left rear hallux', required: true, category: 'LIMB', aliases: ['hallux_l', 'rear_toe_l', 'back_toe_l'] },
  { canonicalId: 'HALLUX_R', label: 'Right rear hallux', required: true, category: 'LIMB', aliases: ['hallux_r', 'rear_toe_r', 'back_toe_r'] },
  { canonicalId: 'PROP_ATTACH', label: 'Prop attachment', required: true, category: 'PROP', aliases: ['prop_attach', 'prop_ctrl', 'map_attach'] },
];

const GOAT_CONTROLS: CanonicalControl[] = [
  { canonicalId: 'ROOT', label: 'Root', required: true, category: 'GLOBAL', aliases: ['root', 'root_ctrl', 'global_root'] },
  { canonicalId: 'MASTER', label: 'Master', required: true, category: 'GLOBAL', aliases: ['master', 'master_ctrl', 'global', 'global_ctrl'] },
  { canonicalId: 'COG', label: 'Center of gravity', required: true, category: 'BODY', aliases: ['cog', 'hips_ctrl', 'pelvis_ctrl'] },
  { canonicalId: 'BODY', label: 'Body', required: true, category: 'BODY', aliases: ['body', 'body_ctrl', 'torso_ctrl'] },
  { canonicalId: 'CHEST', label: 'Chest', required: true, category: 'BODY', aliases: ['chest', 'chest_ctrl', 'upper_torso_ctrl'] },
  { canonicalId: 'HEAD', label: 'Head', required: true, category: 'BODY', aliases: ['head', 'head_ctrl'] },
  { canonicalId: 'NECK', label: 'Neck', required: true, category: 'BODY', aliases: ['neck', 'neck_ctrl'] },
  { canonicalId: 'EYE_L', label: 'Left eye', required: true, category: 'FACE', aliases: ['eye_l', 'eye.L', 'left_eye_ctrl'] },
  { canonicalId: 'EYE_R', label: 'Right eye', required: true, category: 'FACE', aliases: ['eye_r', 'eye.R', 'right_eye_ctrl'] },
  { canonicalId: 'EYE_AIM', label: 'Eye aim', required: true, category: 'FACE', aliases: ['eyes_aim', 'eye_target', 'look_at'] },
  { canonicalId: 'BLINK', label: 'Blink', required: true, category: 'FACE', aliases: ['blink', 'blink_ctrl', 'eyelids'] },
  { canonicalId: 'JAW', label: 'Jaw', required: true, category: 'FACE', aliases: ['jaw', 'jaw_ctrl', 'mouth_open'] },
  { canonicalId: 'MOUTH', label: 'Mouth/dialogue', required: true, category: 'FACE', aliases: ['mouth', 'mouth_ctrl', 'lip_ctrl'] },
  { canonicalId: 'LEG_IK_L', label: 'Left leg IK', required: true, category: 'LIMB', aliases: ['leg_ik_l', 'foot_ik_l', 'leg.L.ik'] },
  { canonicalId: 'LEG_IK_R', label: 'Right leg IK', required: true, category: 'LIMB', aliases: ['leg_ik_r', 'foot_ik_r', 'leg.R.ik'] },
  { canonicalId: 'HOOF_L', label: 'Left hoof', required: true, category: 'LIMB', aliases: ['hoof_l', 'foot_l', 'hoof.L'] },
  { canonicalId: 'HOOF_R', label: 'Right hoof', required: true, category: 'LIMB', aliases: ['hoof_r', 'foot_r', 'hoof.R'] },
  { canonicalId: 'PROP_ATTACH', label: 'Prop attachment', required: true, category: 'PROP', aliases: ['prop_attach', 'prop_ctrl', 'object_attach'] },
];

export type RigControlMapping = {
  schemaVersion: typeof TIVVLEJOY_RIG_CONTROL_ADAPTER_SCHEMA;
  characterId: AdapterCharacterId;
  rigVersionId: string;
  rigSourceSha256: string;
  mappings: Record<string, string>;
};

export function canonicalControlsFor(characterId: AdapterCharacterId) {
  return characterId === 'CHAR_PIP_001' ? PIP_CONTROLS : GOAT_CONTROLS;
}

export function emptyRigControlMapping(characterId: AdapterCharacterId) {
  const mappings = Object.fromEntries(canonicalControlsFor(characterId).map((control) => [control.canonicalId, '']));
  return { schemaVersion: TIVVLEJOY_RIG_CONTROL_ADAPTER_SCHEMA, characterId, rigVersionId: '', rigSourceSha256: '', mappings } satisfies RigControlMapping;
}

export function validateRigControlMapping(mapping: RigControlMapping) {
  const required = canonicalControlsFor(mapping.characterId);
  const errors: string[] = [];
  if (!/^[a-f0-9-]{36}$/i.test(mapping.rigVersionId)) errors.push('RIG_ADAPTER_VERSION_ID_INVALID');
  if (!/^[a-f0-9]{64}$/i.test(mapping.rigSourceSha256)) errors.push('RIG_ADAPTER_SOURCE_SHA_INVALID');
  const used = new Map<string, string>();
  for (const control of required) {
    const mapped = String(mapping.mappings[control.canonicalId] ?? '').trim();
    if (!mapped) {
      errors.push(`RIG_ADAPTER_REQUIRED_CONTROL_MISSING:${control.canonicalId}`);
      continue;
    }
    const normalized = mapped.toLowerCase();
    const prior = used.get(normalized);
    if (prior) errors.push(`RIG_ADAPTER_DUPLICATE_TARGET:${prior}:${control.canonicalId}`);
    else used.set(normalized, control.canonicalId);
  }
  const canonicalIds = new Set(required.map((control) => control.canonicalId));
  for (const key of Object.keys(mapping.mappings)) if (!canonicalIds.has(key)) errors.push(`RIG_ADAPTER_UNKNOWN_CANONICAL_CONTROL:${key}`);
  const normalized = {
    schemaVersion: mapping.schemaVersion,
    characterId: mapping.characterId,
    rigVersionId: mapping.rigVersionId,
    rigSourceSha256: mapping.rigSourceSha256.toLowerCase(),
    mappings: Object.fromEntries(required.map((control) => [control.canonicalId, String(mapping.mappings[control.canonicalId] ?? '').trim()])),
  };
  const adapterSha256 = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return {
    valid: errors.length === 0,
    errors,
    requiredControlCount: required.length,
    mappedControlCount: required.filter((control) => Boolean(String(mapping.mappings[control.canonicalId] ?? '').trim())).length,
    adapterSha256,
    normalized,
    technicalInspectionPassed: false as const,
    humanApproved: false as const,
    productionEnabled: false as const,
  };
}

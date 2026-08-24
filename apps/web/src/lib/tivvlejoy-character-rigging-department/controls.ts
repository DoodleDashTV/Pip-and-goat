export type ControlSystem = {
  id: string;
  family: string;
  sides: readonly ('C' | 'L' | 'R')[];
  features: readonly string[];
  anatomyDependent?: boolean;
};

export const CONTROL_SYSTEMS: readonly ControlSystem[] = [
  { id: 'GLOBAL', family: 'ROOT_MOTION', sides: ['C'], features: ['master', 'world', 'character_root', 'cog', 'pelvis'] },
  { id: 'TORSO', family: 'BODY_CENTER', sides: ['C'], features: ['spine', 'chest', 'upper_chest', 'neck', 'head', 'head_isolate'] },
  {
    id: 'LEGS',
    family: 'LEG_LEFT',
    sides: ['L', 'R'],
    features: ['thigh', 'shin', 'ankle', 'foot', 'toe', 'ik', 'fk', 'ik_fk_switch', 'pole', 'foot_roll', 'heel', 'toe_pivot', 'ball_pivot', 'knee_direction', 'limited_stretch'],
  },
  {
    id: 'ARMS',
    family: 'ARM_OR_WING_LEFT',
    sides: ['L', 'R'],
    features: ['clavicle', 'upper_arm', 'forearm', 'wrist', 'hand', 'ik', 'fk', 'ik_fk_switch', 'pole', 'hand_space'],
    anatomyDependent: true,
  },
  {
    id: 'FACE',
    family: 'FACE_EXPRESSION',
    sides: ['C'],
    features: ['eye_aim_master', 'eye_independent', 'blink', 'eyelid_upper', 'eyelid_lower', 'eyelid_follow', 'brow', 'jaw', 'mouth_open', 'mouth_width', 'smile', 'frown', 'corners', 'cheek', 'muzzle'],
  },
];

export const IK_FK_FEATURES = ['ik', 'fk', 'ik_fk_switch', 'pole'] as const;

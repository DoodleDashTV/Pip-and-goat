export type BoneRole =
  | 'MASTER'
  | 'WORLD_ROOT'
  | 'CHARACTER_ROOT'
  | 'COG'
  | 'PELVIS'
  | 'SPINE'
  | 'CHEST'
  | 'UPPER_CHEST'
  | 'NECK'
  | 'HEAD'
  | 'HEAD_ISOLATE'
  | 'CLAVICLE'
  | 'UPPER_ARM'
  | 'FOREARM'
  | 'WRIST'
  | 'HAND'
  | 'THIGH'
  | 'SHIN'
  | 'ANKLE'
  | 'FOOT'
  | 'TOE'
  | 'POLE'
  | 'IK_TARGET'
  | 'EYE'
  | 'JAW'
  | 'ACCESSORY';

export type PlannedBone = {
  controlId: string;
  role: BoneRole;
  side: 'C' | 'L' | 'R';
  deform: boolean;
  required: boolean;
  anatomyDependent?: boolean;
};

export const GENERIC_SKELETON_PLAN: readonly PlannedBone[] = [
  { controlId: 'CTRL.MASTER', role: 'MASTER', side: 'C', deform: false, required: true },
  { controlId: 'CTRL.WORLD', role: 'WORLD_ROOT', side: 'C', deform: false, required: true },
  { controlId: 'CTRL.ROOT', role: 'CHARACTER_ROOT', side: 'C', deform: false, required: true },
  { controlId: 'CTRL.COG', role: 'COG', side: 'C', deform: false, required: true },
  { controlId: 'DEF.PELVIS', role: 'PELVIS', side: 'C', deform: true, required: true },
  { controlId: 'DEF.SPINE_01', role: 'SPINE', side: 'C', deform: true, required: true },
  { controlId: 'DEF.SPINE_02', role: 'SPINE', side: 'C', deform: true, required: true },
  { controlId: 'DEF.CHEST', role: 'CHEST', side: 'C', deform: true, required: true },
  { controlId: 'DEF.UPPER_CHEST', role: 'UPPER_CHEST', side: 'C', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.NECK', role: 'NECK', side: 'C', deform: true, required: true },
  { controlId: 'DEF.HEAD', role: 'HEAD', side: 'C', deform: true, required: true },
  { controlId: 'CTRL.HEAD_ISOLATE', role: 'HEAD_ISOLATE', side: 'C', deform: false, required: true },
  { controlId: 'DEF.JAW', role: 'JAW', side: 'C', deform: true, required: true },
  { controlId: 'DEF.EYE.L', role: 'EYE', side: 'L', deform: true, required: true },
  { controlId: 'DEF.EYE.R', role: 'EYE', side: 'R', deform: true, required: true },
  { controlId: 'DEF.CLAVICLE.L', role: 'CLAVICLE', side: 'L', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.CLAVICLE.R', role: 'CLAVICLE', side: 'R', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.UPPER_ARM.L', role: 'UPPER_ARM', side: 'L', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.UPPER_ARM.R', role: 'UPPER_ARM', side: 'R', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.FOREARM.L', role: 'FOREARM', side: 'L', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.FOREARM.R', role: 'FOREARM', side: 'R', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.WRIST.L', role: 'WRIST', side: 'L', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.WRIST.R', role: 'WRIST', side: 'R', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.HAND.L', role: 'HAND', side: 'L', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.HAND.R', role: 'HAND', side: 'R', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.THIGH.L', role: 'THIGH', side: 'L', deform: true, required: true },
  { controlId: 'DEF.THIGH.R', role: 'THIGH', side: 'R', deform: true, required: true },
  { controlId: 'DEF.SHIN.L', role: 'SHIN', side: 'L', deform: true, required: true },
  { controlId: 'DEF.SHIN.R', role: 'SHIN', side: 'R', deform: true, required: true },
  { controlId: 'DEF.ANKLE.L', role: 'ANKLE', side: 'L', deform: true, required: true },
  { controlId: 'DEF.ANKLE.R', role: 'ANKLE', side: 'R', deform: true, required: true },
  { controlId: 'DEF.FOOT.L', role: 'FOOT', side: 'L', deform: true, required: true },
  { controlId: 'DEF.FOOT.R', role: 'FOOT', side: 'R', deform: true, required: true },
  { controlId: 'DEF.TOE.L', role: 'TOE', side: 'L', deform: true, required: false, anatomyDependent: true },
  { controlId: 'DEF.TOE.R', role: 'TOE', side: 'R', deform: true, required: false, anatomyDependent: true },
  { controlId: 'CTRL.IK.FOOT.L', role: 'IK_TARGET', side: 'L', deform: false, required: true },
  { controlId: 'CTRL.IK.FOOT.R', role: 'IK_TARGET', side: 'R', deform: false, required: true },
  { controlId: 'CTRL.POLE.KNEE.L', role: 'POLE', side: 'L', deform: false, required: true },
  { controlId: 'CTRL.POLE.KNEE.R', role: 'POLE', side: 'R', deform: false, required: true },
  { controlId: 'CTRL.IK.HAND.L', role: 'IK_TARGET', side: 'L', deform: false, required: false, anatomyDependent: true },
  { controlId: 'CTRL.IK.HAND.R', role: 'IK_TARGET', side: 'R', deform: false, required: false, anatomyDependent: true },
  { controlId: 'CTRL.POLE.ELBOW.L', role: 'POLE', side: 'L', deform: false, required: false, anatomyDependent: true },
  { controlId: 'CTRL.POLE.ELBOW.R', role: 'POLE', side: 'R', deform: false, required: false, anatomyDependent: true },
  { controlId: 'CTRL.COLLAR', role: 'ACCESSORY', side: 'C', deform: false, required: true },
  { controlId: 'CTRL.TAG', role: 'ACCESSORY', side: 'C', deform: false, required: true },
];

export function requiredSkeletonBones(plan = GENERIC_SKELETON_PLAN): PlannedBone[] {
  return plan.filter((bone) => bone.required);
}

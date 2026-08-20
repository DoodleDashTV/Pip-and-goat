import { capability } from './rig-contract';
import type { CapabilitySpec } from './types';

export const PIP_CAPABILITY_PROFILE: CapabilitySpec[] = [
  capability('HEAD', 'PIP.HEAD', 'REQUIRED', 'head turns and acting'),
  capability('NECK', 'PIP.NECK', 'REQUIRED', 'neck follow-through'),
  capability('EYE_LEFT', 'PIP.EYE_LEFT', 'REQUIRED', 'left eye aim'),
  capability('EYE_RIGHT', 'PIP.EYE_RIGHT', 'REQUIRED', 'right eye aim'),
  capability('EYE_AIM', 'PIP.EYE_AIM', 'REQUIRED', 'shared gaze target'),
  capability('EYELID_LEFT', 'PIP.EYELID_LEFT', 'REQUIRED', 'left blink / lid'),
  capability('EYELID_RIGHT', 'PIP.EYELID_RIGHT', 'REQUIRED', 'right blink / lid'),
  capability('MOUTH_OR_BEAK_UPPER', 'PIP.BEAK_UPPER', 'REQUIRED', 'BEAK_OPEN upper'),
  capability('MOUTH_OR_BEAK_LOWER', 'PIP.BEAK_LOWER', 'REQUIRED', 'BEAK_OPEN lower'),
  capability('ARM_OR_WING_LEFT', 'PIP.WING_LEFT', 'REQUIRED', 'left long wing'),
  capability('ARM_OR_WING_RIGHT', 'PIP.WING_RIGHT', 'REQUIRED', 'right long wing'),
  capability('LEG_LEFT', 'PIP.LEG_LEFT', 'REQUIRED', 'left locomotion'),
  capability('LEG_RIGHT', 'PIP.LEG_RIGHT', 'REQUIRED', 'right locomotion'),
  capability('FOOT_LEFT', 'PIP.FOOT_LEFT', 'REQUIRED', 'three-toed plant'),
  capability('FOOT_RIGHT', 'PIP.FOOT_RIGHT', 'REQUIRED', 'three-toed plant'),
  capability('TOE_OR_DIGIT_CONTROLS', 'PIP.TOES', 'REQUIRED', 'three-toed foot behavior'),
  capability('ROOT_MOTION', 'PIP.ROOT', 'REQUIRED', 'root placement'),
  capability('BODY_CENTER', 'PIP.BODY', 'REQUIRED', 'body acting'),
  capability('CHEST', 'PIP.CHEST', 'REQUIRED', 'breath and lean'),
  capability('PROP_ATTACHMENT_POINTS', 'PIP.PROP_HAND', 'REQUIRED', 'map carry / attachment'),
  capability('ACCESSORY_CONTROLS', 'PIP.SCARF', 'REQUIRED', 'scarf identity'),
  capability('ACCESSORY_CONTROLS', 'PIP.BACKPACK', 'REQUIRED', 'backpack identity'),
  capability('ACCESSORY_CONTROLS', 'PIP.STRAP_LEFT', 'REQUIRED', 'left shoulder strap'),
  capability('ACCESSORY_CONTROLS', 'PIP.STRAP_RIGHT', 'REQUIRED', 'right shoulder strap'),
  capability('ACCESSORY_CONTROLS', 'PIP.COPPER_SPIRAL', 'REQUIRED', 'copper spiral accessory'),
  capability('TOE_OR_DIGIT_CONTROLS', 'PIP.HALLUX', 'DESIRABLE', 'rear hallux / contact'),
  capability('FACE_EXPRESSION', 'PIP.CREST', 'OPTIONAL', 'CREST_SECONDARY_MOTION'),
];

export const PIP_REQUIRED_CONTROLS = PIP_CAPABILITY_PROFILE.filter((item) => item.requirement === 'REQUIRED').map(
  (item) => item.controlId,
);

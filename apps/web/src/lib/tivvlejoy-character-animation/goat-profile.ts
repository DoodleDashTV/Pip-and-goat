import { capability } from './rig-contract';
import type { CapabilitySpec } from './types';

export const GOAT_CAPABILITY_PROFILE: CapabilitySpec[] = [
  capability('HEAD', 'GOAT.HEAD', 'REQUIRED', 'head turns'),
  capability('NECK', 'GOAT.NECK', 'REQUIRED', 'neck acting'),
  capability('EYE_LEFT', 'GOAT.EYE_LEFT', 'REQUIRED', 'left eye'),
  capability('EYE_RIGHT', 'GOAT.EYE_RIGHT', 'REQUIRED', 'right eye'),
  capability('EYE_AIM', 'GOAT.EYE_AIM', 'REQUIRED', 'shared gaze'),
  capability('MOUTH_OR_BEAK_LOWER', 'GOAT.JAW', 'REQUIRED', 'jaw / mouth open'),
  capability('MOUTH_OR_BEAK_UPPER', 'GOAT.MOUTH_UPPER', 'REQUIRED', 'upper mouth'),
  capability('FACE_EXPRESSION', 'GOAT.FACE', 'REQUIRED', 'facial expression'),
  capability('LEG_LEFT', 'GOAT.LEG_LEFT', 'REQUIRED', 'walk / run / jump'),
  capability('LEG_RIGHT', 'GOAT.LEG_RIGHT', 'REQUIRED', 'walk / run / jump'),
  capability('FOOT_LEFT', 'GOAT.HOOF_LEFT', 'REQUIRED', 'hoof contact'),
  capability('FOOT_RIGHT', 'GOAT.HOOF_RIGHT', 'REQUIRED', 'hoof contact'),
  capability('BODY_CENTER', 'GOAT.BODY', 'REQUIRED', 'body acting'),
  capability('CHEST', 'GOAT.CHEST', 'REQUIRED', 'weight and breath'),
  capability('ROOT_MOTION', 'GOAT.ROOT', 'REQUIRED', 'root motion'),
  capability('PROP_ATTACHMENT_POINTS', 'GOAT.PROP_MOUTH', 'REQUIRED', 'prop interaction'),
  capability('ACCESSORY_CONTROLS', 'GOAT.COLLAR', 'REQUIRED', 'collar identity'),
  capability('ACCESSORY_CONTROLS', 'GOAT.TAG', 'REQUIRED', 'round Goat tag'),
  capability('EYELID_LEFT', 'GOAT.EYELID_LEFT', 'DESIRABLE', 'blink if available'),
  capability('EYELID_RIGHT', 'GOAT.EYELID_RIGHT', 'DESIRABLE', 'blink if available'),
  capability('FACE_EXPRESSION', 'GOAT.EAR_LEFT', 'OPTIONAL', 'ear reaction if controllable'),
  capability('FACE_EXPRESSION', 'GOAT.EAR_RIGHT', 'OPTIONAL', 'ear reaction if controllable'),
  capability('BODY_CENTER', 'GOAT.SIT', 'OPTIONAL', 'sitting if the rig supports it'),
];

export const GOAT_REQUIRED_CONTROLS = GOAT_CAPABILITY_PROFILE.filter((item) => item.requirement === 'REQUIRED').map(
  (item) => item.controlId,
);

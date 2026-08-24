import { GOAT_EXPRESSIONS, type GoatExpression } from './types';

export type FaceControl = {
  id: string;
  method: 'BONE' | 'SHAPE_KEY' | 'DRIVER' | 'MIX';
  required: boolean;
};

export const FACE_CONTROLS: readonly FaceControl[] = [
  { id: 'eye_aim_master', method: 'BONE', required: true },
  { id: 'eye_left', method: 'BONE', required: true },
  { id: 'eye_right', method: 'BONE', required: true },
  { id: 'blink', method: 'MIX', required: true },
  { id: 'eyelid_upper', method: 'MIX', required: true },
  { id: 'eyelid_lower', method: 'MIX', required: false },
  { id: 'eyelid_follow', method: 'DRIVER', required: false },
  { id: 'brow', method: 'SHAPE_KEY', required: false },
  { id: 'jaw', method: 'BONE', required: true },
  { id: 'mouth_open', method: 'MIX', required: true },
  { id: 'mouth_width', method: 'SHAPE_KEY', required: true },
  { id: 'smile', method: 'SHAPE_KEY', required: true },
  { id: 'frown', method: 'SHAPE_KEY', required: true },
  { id: 'corners', method: 'SHAPE_KEY', required: true },
  { id: 'cheek', method: 'SHAPE_KEY', required: false },
  { id: 'muzzle', method: 'BONE', required: false },
];

export const EXPRESSION_DRIVERS: Record<GoatExpression, readonly string[]> = {
  happy: ['smile', 'cheek', 'eye_aim_master'],
  excited: ['smile', 'mouth_open', 'brow'],
  curious: ['brow', 'eyelid_upper', 'head_tilt'],
  surprised: ['mouth_open', 'brow', 'eyelid_upper'],
  worried: ['frown', 'brow'],
  confused: ['brow', 'corners'],
  sad: ['frown', 'eyelid_lower'],
  determined: ['mouth_width', 'brow'],
  mischievous: ['smile', 'corners', 'eye_left'],
  laughing: ['smile', 'mouth_open', 'cheek'],
};

export function expressionControls(expression: GoatExpression): readonly string[] {
  return EXPRESSION_DRIVERS[expression];
}

export function allGoatExpressions(): readonly GoatExpression[] {
  return GOAT_EXPRESSIONS;
}

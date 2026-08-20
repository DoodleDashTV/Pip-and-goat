import { sha256Canonical } from './hash';
import type { PoseResult } from './types';

export const PIP_TEST_POSES = [
  'neutral',
  'happy',
  'curious',
  'surprised',
  'concerned',
  'beak open',
  'beak closed',
  'blink',
  'look left',
  'look right',
  'wing raised',
  'wing spread',
  'walk contact',
  'run contact',
  'one-foot balance',
  'map carry',
  'backpack continuity',
] as const;

export const GOAT_TEST_POSES = [
  'neutral',
  'happy',
  'confused',
  'surprised',
  'mouth open',
  'blink if supported',
  'look left/right',
  'walk',
  'run',
  'jump',
  'turn',
  'sit if supported',
  'map interaction',
  'collar/tag stability',
] as const;

export type PoseRow = { poseId: string; result: PoseResult; detail: string };

export type TestPoseMatrix = {
  characterId: 'PIP' | 'GOAT';
  rows: PoseRow[];
  synthetic: true;
  matrixSha256: string;
};

export function buildTestPoseMatrix(characterId: 'PIP' | 'GOAT', overrides: Partial<Record<string, PoseResult>> = {}): TestPoseMatrix {
  const poses = characterId === 'PIP' ? PIP_TEST_POSES : GOAT_TEST_POSES;
  const rows = poses.map((poseId) => ({
    poseId,
    result: overrides[poseId] ?? 'NOT_TESTED',
    detail: overrides[poseId] ? 'synthetic override' : 'synthetic fixture; visual deformation not tested',
  }));
  const body = { characterId, rows, synthetic: true as const };
  return { ...body, matrixSha256: sha256Canonical(body) };
}

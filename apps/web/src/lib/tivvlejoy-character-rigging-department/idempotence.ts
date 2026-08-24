import type { StageOutcome } from './types';

export function decideStageOutcome(input: {
  blocked: boolean;
  failed?: boolean;
  stageExists: boolean;
  inputHash: string;
  previousInputHash: string | null;
}): StageOutcome {
  if (input.failed) return 'FAILED';
  if (input.blocked) return 'BLOCKED';
  if (input.stageExists && input.previousInputHash === input.inputHash) return 'REUSED';
  if (input.stageExists) return 'UPDATED';
  return 'CREATED';
}

export const IDEMPOTENCE_RULES = [
  'Do not create a second armature when the named armature already exists.',
  'Do not duplicate controls, vertex groups, drivers, shape keys, actions, or collections.',
  'Reuse a stage when its input hash and version are unchanged.',
  'Update a stage only when inputs changed.',
  'Never overwrite the immutable SOURCE copy.',
] as const;

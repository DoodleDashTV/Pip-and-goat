import { sha256Canonical } from '@/lib/tivvlejoy-nightshift-production';
import {
  EP001_READINESS_SCHEMA,
  type Ep001BlockerCode,
  type Ep001Readiness,
  type Ep001ReadinessInput,
} from './types';

const BLOCKER_LABELS: Record<Ep001BlockerCode, string> = {
  PIP_APPROVED_RIG_REQUIRED: 'Approved artist-authored Pip rig required.',
  GOAT_APPROVED_RIG_REQUIRED: 'Approved artist-authored Goat rig required.',
  APPROVED_SCENERY_BINDINGS_REQUIRED:
    'Resolve every logical scenery role to an approved immutable asset.',
  EXACT_VOICE_RECEIPTS_REQUIRED:
    'Bind exact Pip and Goat voice receipts before dialogue animation.',
  HUMAN_STORY_APPROVAL_REQUIRED: 'Human story approval is required before canon lock.',
  HUMAN_VISUAL_APPROVAL_REQUIRED:
    'Human visual approval is required after real-rig review media exists.',
  PAID_FINAL_RENDER_AUTHORIZATION_REQUIRED:
    'A separate paid final-render authorization is required.',
};

export function evaluateEp001Readiness(input: Ep001ReadinessInput = {}): Ep001Readiness {
  const blockers: Ep001Readiness['blockers'] = [];
  const add = (code: Ep001BlockerCode) => blockers.push({ code, label: BLOCKER_LABELS[code] });

  if (input.pipRigApproved !== true) add('PIP_APPROVED_RIG_REQUIRED');
  if (input.goatRigApproved !== true) add('GOAT_APPROVED_RIG_REQUIRED');
  if (input.sceneryBindingsApproved !== true) add('APPROVED_SCENERY_BINDINGS_REQUIRED');
  if (input.exactVoiceReceiptsBound !== true) add('EXACT_VOICE_RECEIPTS_REQUIRED');
  if (input.humanStoryApproval !== true) add('HUMAN_STORY_APPROVAL_REQUIRED');
  if (input.humanVisualApproval !== true) add('HUMAN_VISUAL_APPROVAL_REQUIRED');
  if (input.paidFinalRenderAuthorized !== true) add('PAID_FINAL_RENDER_AUTHORIZATION_REQUIRED');

  let state: Ep001Readiness['state'] = 'CONTROLLED_EXECUTION_PREFLIGHT_READY';
  if (input.pipRigApproved !== true || input.goatRigApproved !== true)
    state = 'WAITING_FOR_CHARACTER_RIGS';
  else if (input.sceneryBindingsApproved !== true) state = 'WAITING_FOR_SCENERY_BINDINGS';
  else if (input.exactVoiceReceiptsBound !== true) state = 'WAITING_FOR_VOICE_RECEIPTS';
  else if (input.humanStoryApproval !== true) state = 'WAITING_FOR_HUMAN_STORY_APPROVAL';
  else if (input.humanVisualApproval !== true) state = 'WAITING_FOR_HUMAN_VISUAL_APPROVAL';
  else if (input.paidFinalRenderAuthorized !== true)
    state = 'WAITING_FOR_PAID_RENDER_AUTHORIZATION';

  const controlledPreflightAllowed = blockers.length === 0;
  const body = {
    schemaVersion: EP001_READINESS_SCHEMA,
    state,
    blockers,
    planningComplete: true as const,
    controlledPreflightAllowed,
    launchAllowed: false as const,
    characterAnimationExecutionAllowed: false as const,
    voiceProviderCallsAllowed: false as const,
    paidComputeAllowed: false as const,
    productionWritesAllowed: false as const,
    autoApprovalAllowed: false as const,
  };
  return {
    ...body,
    readinessSha256: sha256Canonical({
      schemaVersion: body.schemaVersion,
      state: body.state,
      blockerCodes: body.blockers.map((item) => item.code),
      controlledPreflightAllowed,
    }),
  };
}

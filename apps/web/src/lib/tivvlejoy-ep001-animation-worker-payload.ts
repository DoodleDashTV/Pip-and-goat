import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001PerShotCharacterIntegration } from '@/lib/tivvlejoy-ep001-per-shot-character-integration';
import { compileEp001MapPropHandoff } from '@/lib/tivvlejoy-ep001-map-prop-handoff';
import { compileEp001DialogueAnimationManifest } from '@/lib/tivvlejoy-ep001-dialogue-animation-manifest';
import { compileEp001ShotAnimationEvidence } from '@/lib/tivvlejoy-ep001-shot-animation-evidence';

export const EP001_ANIMATION_WORKER_PAYLOAD_SCHEMA = 'TIVVLEJOY_EP001_ANIMATION_WORKER_PAYLOAD_V1' as const;

type CharacterPackageBinding = {
  characterId: 'CHAR_PIP_001' | 'CHAR_GOAT_001';
  packageSha256: string;
  canonicalBlendSha256: string;
  adapterSha256: string;
  humanApprovalReceiptSha256: string;
};

type VoiceBinding = {
  lineId: string;
  audioSourceSha256: string;
  voiceReceiptSha256: string;
  lineTimingReceiptSha256: string;
  wordTimingReceiptSha256: string;
};

export type Ep001AnimationWorkerInput = {
  pip: CharacterPackageBinding;
  goat: CharacterPackageBinding;
  sceneryPackageSha256: string;
  sceneryAdmissionReceiptSha256: string;
  voiceBindings: VoiceBinding[];
};

const SHA = /^[a-f0-9]{64}$/i;

export function compileEp001AnimationWorkerPayload(input: Ep001AnimationWorkerInput) {
  const integration = compileEp001PerShotCharacterIntegration();
  const prop = compileEp001MapPropHandoff();
  const dialogue = compileEp001DialogueAnimationManifest();
  const evidence = compileEp001ShotAnimationEvidence();
  const errors: string[] = [];

  if (input.pip.characterId !== 'CHAR_PIP_001') errors.push('EP001_ANIM_PIP_CHARACTER_ID_INVALID');
  if (input.goat.characterId !== 'CHAR_GOAT_001') errors.push('EP001_ANIM_GOAT_CHARACTER_ID_INVALID');
  for (const [name, value] of Object.entries({
    pipPackageSha256: input.pip.packageSha256,
    pipBlendSha256: input.pip.canonicalBlendSha256,
    pipAdapterSha256: input.pip.adapterSha256,
    pipApprovalSha256: input.pip.humanApprovalReceiptSha256,
    goatPackageSha256: input.goat.packageSha256,
    goatBlendSha256: input.goat.canonicalBlendSha256,
    goatAdapterSha256: input.goat.adapterSha256,
    goatApprovalSha256: input.goat.humanApprovalReceiptSha256,
    sceneryPackageSha256: input.sceneryPackageSha256,
    sceneryAdmissionReceiptSha256: input.sceneryAdmissionReceiptSha256,
  })) if (!SHA.test(value)) errors.push(`EP001_ANIM_HASH_INVALID:${name}`);

  const expectedLines = dialogue.lines.map((line) => line.lineId).sort();
  const actualLines = input.voiceBindings.map((line) => line.lineId).sort();
  if (JSON.stringify(expectedLines) !== JSON.stringify(actualLines)) errors.push('EP001_ANIM_VOICE_BINDING_SET_MISMATCH');
  for (const binding of input.voiceBindings) {
    if (!expectedLines.includes(binding.lineId)) errors.push(`EP001_ANIM_UNKNOWN_VOICE_LINE:${binding.lineId}`);
    for (const [name, value] of Object.entries({
      audioSourceSha256: binding.audioSourceSha256,
      voiceReceiptSha256: binding.voiceReceiptSha256,
      lineTimingReceiptSha256: binding.lineTimingReceiptSha256,
      wordTimingReceiptSha256: binding.wordTimingReceiptSha256,
    })) if (!SHA.test(value)) errors.push(`EP001_ANIM_VOICE_HASH_INVALID:${binding.lineId}:${name}`);
  }

  const immutableInputs = {
    pip: { ...input.pip },
    goat: { ...input.goat },
    sceneryPackageSha256: input.sceneryPackageSha256.toLowerCase(),
    sceneryAdmissionReceiptSha256: input.sceneryAdmissionReceiptSha256.toLowerCase(),
    voiceBindings: [...input.voiceBindings].sort((a,b) => a.lineId.localeCompare(b.lineId)).map((item) => ({
      ...item,
      audioSourceSha256: item.audioSourceSha256.toLowerCase(),
      voiceReceiptSha256: item.voiceReceiptSha256.toLowerCase(),
      lineTimingReceiptSha256: item.lineTimingReceiptSha256.toLowerCase(),
      wordTimingReceiptSha256: item.wordTimingReceiptSha256.toLowerCase(),
    })),
  };
  const immutableInputSha256 = sha256Canonical(immutableInputs);

  const shotJobs = integration.shots.map((shot) => {
    const shotEvidence = evidence.shots.find((item) => item.shotId === shot.shotId)!;
    const shotDialogue = dialogue.lines.filter((line) => line.shotId === shot.shotId);
    const shotPropTransitions = [
      ...prop.storyMap.transitions.filter((item) => item.shotId === shot.shotId),
      ...prop.mapFragment.transitions.filter((item) => item.shotId === shot.shotId),
    ];
    const body = {
      schemaVersion: EP001_ANIMATION_WORKER_PAYLOAD_SCHEMA,
      episodeId: 'EP001' as const,
      shotId: shot.shotId,
      immutableInputSha256,
      shotIntegrationSha256: shot.shotIntegrationSha256,
      shotEvidenceContractSha256: shotEvidence.shotEvidenceContractSha256,
      mapPropHandoffSha256: prop.mapPropHandoffSha256,
      dialogueAnimationManifestSha256: dialogue.dialogueAnimationManifestSha256,
      frameRange: { start: shot.inFrame, endExclusive: shot.outFrame, fps: 30 as const },
      characterPlans: shot.characterPlans,
      dialogueLines: shotDialogue.map((line) => ({ lineId: line.lineId, startFrame: line.startFrame, endFrame: line.endFrame, faceControls: line.faceControls, gestureControls: line.gestureControls })),
      propTransitions: shotPropTransitions,
      approvedInputBindings: immutableInputs,
      execution: {
        blenderVersion: '4.2' as const,
        sourceCharacterLibrariesReadOnly: true as const,
        networkAccessInsideBlender: false as const,
        embeddedSourceScriptsAllowed: false as const,
        autosaveIntoSourceRigAllowed: false as const,
        oneShotPerWorkerJob: true as const,
        maxWallClockMinutes: 20 as const,
        maxGpuSpendUsd: 0 as const,
        paidExecutionAuthorized: false as const,
        workerLaunchAllowed: false as const,
      },
      outputs: shotEvidence.outputs,
      authority: {
        canLaunchWorker: false as const,
        canSpend: false as const,
        canApproveShot: false as const,
        canWriteProduction: false as const,
      },
    };
    return { ...body, workerPayloadSha256: sha256Canonical(body) };
  });

  const body = {
    schemaVersion: EP001_ANIMATION_WORKER_PAYLOAD_SCHEMA,
    episodeId: 'EP001' as const,
    immutableInputs,
    immutableInputSha256,
    perShotCharacterIntegrationSha256: integration.perShotCharacterIntegrationSha256,
    mapPropHandoffSha256: prop.mapPropHandoffSha256,
    dialogueAnimationManifestSha256: dialogue.dialogueAnimationManifestSha256,
    shotAnimationEvidenceSha256: evidence.shotAnimationEvidenceSha256,
    structurallyReady: errors.length === 0,
    errors,
    shotJobs,
    metrics: {
      shotJobCount: shotJobs.length,
      voiceBindingCount: input.voiceBindings.length,
      workerLaunchCount: 0 as const,
      paidRequestCount: 0 as const,
      productionMutationCount: 0 as const,
    },
    authority: {
      executionAuthorized: false as const,
      paidComputeAllowed: false as const,
      workerLaunchAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
  };
  return { ...body, animationWorkerPlanSha256: sha256Canonical(body) };
}

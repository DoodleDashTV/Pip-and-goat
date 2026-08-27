import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileCharacterAnimationQualityStandard } from '@/lib/tivvlejoy-character-animation-quality-standard';
import { compileCharacterMotionLibraryContract } from '@/lib/tivvlejoy-character-motion-library-contract';
import { compileCharacterExpressionPoseLibrary } from '@/lib/tivvlejoy-character-expression-pose-library';
import { compileEp001AnimationExecutionManifest } from '@/lib/tivvlejoy-ep001-animation-execution-manifest';
import { compileEp001VoiceExecutionReadiness } from '@/lib/tivvlejoy-ep001-voice-execution-readiness';
import { compileEp001SceneryAdmissionReadiness } from '@/lib/tivvlejoy-ep001-scenery-admission-readiness';
import { compileEp001RigDeliveryContract } from '@/lib/tivvlejoy-ep001-rig-delivery-contract';
import { compileEp001RigInspectionProtocol } from '@/lib/tivvlejoy-ep001-rig-inspection-protocol';
import { compileEp001FinalRenderReleaseGate } from '@/lib/tivvlejoy-ep001-final-render-release-gate';
import { compileEp001PublishingReleaseGate } from '@/lib/tivvlejoy-ep001-publishing-release-gate';
import { compileEp001DeliveryArchiveManifest } from '@/lib/tivvlejoy-ep001-delivery-archive-manifest';

export const EP001_PRE_RIG_READINESS_AUDIT_SCHEMA =
  'TIVVLEJOY_EP001_PRE_RIG_READINESS_AUDIT_V1' as const;

type AuditClass = 'SOFTWARE_READY' | 'EXTERNAL_EXECUTION_REQUIRED' | 'PHYSICAL_ASSET_REQUIRED' | 'HUMAN_DECISION_REQUIRED';

export function compileEp001PreRigReadinessAudit() {
  const rigDelivery = compileEp001RigDeliveryContract();
  const rigInspection = compileEp001RigInspectionProtocol();
  const quality = compileCharacterAnimationQualityStandard();
  const motion = compileCharacterMotionLibraryContract();
  const expressions = compileCharacterExpressionPoseLibrary();
  const animation = compileEp001AnimationExecutionManifest();
  const voices = compileEp001VoiceExecutionReadiness();
  const scenery = compileEp001SceneryAdmissionReadiness();
  const render = compileEp001FinalRenderReleaseGate();
  const publishing = compileEp001PublishingReleaseGate();
  const archive = compileEp001DeliveryArchiveManifest();

  const rows: Array<{
    id: string;
    label: string;
    class: AuditClass;
    planningReady: boolean;
    realEvidenceComplete: boolean;
    blocker: string | null;
    artifactSha256: string;
  }> = [
    { id: 'PRE_RIG_01', label: 'Artist rig delivery contract', class: 'SOFTWARE_READY', planningReady: true, realEvidenceComplete: false, blocker: 'Corrected canonical Pip and Goat artist source files have not been delivered and admitted.', artifactSha256: rigDelivery.contractSha256 },
    { id: 'PRE_RIG_02', label: 'Rig inspection protocol', class: 'SOFTWARE_READY', planningReady: true, realEvidenceComplete: false, blocker: 'Inspection requires the real SHA-bound artist rig bytes.', artifactSha256: rigInspection.protocolSha256 },
    { id: 'PRE_RIG_03', label: 'Animation quality standard', class: 'SOFTWARE_READY', planningReady: true, realEvidenceComplete: true, blocker: null, artifactSha256: quality.qualityStandardSha256 },
    { id: 'PRE_RIG_04', label: 'Reusable motion library specification', class: 'SOFTWARE_READY', planningReady: true, realEvidenceComplete: false, blocker: 'Reusable actions must bind to admitted rig SHA-256 identities before authoring.', artifactSha256: motion.motionLibraryContractSha256 },
    { id: 'PRE_RIG_05', label: 'Expression/dialogue-pose library specification', class: 'SOFTWARE_READY', planningReady: true, realEvidenceComplete: false, blocker: 'Facial controls can only be bound after the actual rigs are inspected.', artifactSha256: expressions.expressionPoseLibrarySha256 },
    { id: 'PRE_RIG_06', label: '10-shot animation execution manifest', class: 'SOFTWARE_READY', planningReady: true, realEvidenceComplete: false, blocker: 'Shot execution requires admitted Pip and Goat rigs plus approved dialogue timing.', artifactSha256: animation.executionManifestSha256 },
    { id: 'PRE_RIG_07', label: 'Eight-line voice execution packet', class: 'EXTERNAL_EXECUTION_REQUIRED', planningReady: true, realEvidenceComplete: false, blocker: 'A real voice-provider execution channel must generate and persist the eight exact audio/timing receipts.', artifactSha256: voices.voiceExecutionReadinessSha256 },
    { id: 'PRE_RIG_08', label: 'Scenery admission packet', class: 'EXTERNAL_EXECUTION_REQUIRED', planningReady: true, realEvidenceComplete: false, blocker: 'Real purchased/native source hashes, license/provenance, inspection evidence, and human visual approval must be supplied.', artifactSha256: scenery.sceneryAdmissionReadinessSha256 },
    { id: 'PRE_RIG_09', label: 'Human story / rig / visual decisions', class: 'HUMAN_DECISION_REQUIRED', planningReady: true, realEvidenceComplete: false, blocker: 'Human decisions cannot be inferred or issued automatically.', artifactSha256: animation.animationReleaseGateSha256 },
    { id: 'PRE_RIG_10', label: 'Final-render release gate', class: 'SOFTWARE_READY', planningReady: true, realEvidenceComplete: false, blocker: 'Requires approved animation evidence and a fresh exact cost-capped render authorization at execution time.', artifactSha256: render.finalRenderGateSha256 },
    { id: 'PRE_RIG_11', label: 'Publishing release gate', class: 'SOFTWARE_READY', planningReady: true, realEvidenceComplete: false, blocker: 'Requires exact encoded media, final QA, platform settings, and explicit per-platform upload authorization.', artifactSha256: publishing.publishingGateSha256 },
    { id: 'PRE_RIG_12', label: 'Delivery/archive manifest', class: 'SOFTWARE_READY', planningReady: true, realEvidenceComplete: false, blocker: 'Archive receipts require the finished source/render/media artifacts.', artifactSha256: archive.archiveManifestSha256 },
  ];

  const physicalAssetBlockers = [
    { characterId: 'PIP' as const, required: true as const, present: false as const, reason: 'Corrected artist-authored canonical Pip/Bird rig bytes are not present.' },
    { characterId: 'GOAT' as const, required: true as const, present: false as const, reason: 'Corrected artist-authored canonical Goat rig bytes are not present.' },
  ];

  const body = {
    schemaVersion: EP001_PRE_RIG_READINESS_AUDIT_SCHEMA,
    episodeId: 'EP001' as const,
    state: 'AUTONOMOUS_SOFTWARE_PREPARATION_EXHAUSTED_EXTERNAL_EVIDENCE_REQUIRED' as const,
    rows,
    physicalAssetBlockers,
    currentConclusion: {
      autonomousEngineeringRemaining: false as const,
      safePaidComputeUsefulBeforeRigArrival: false as const,
      reasonPaidComputeNotUsefulYet: 'No real admitted character rig bytes are available to animate, inspect, or render; spending GPU money now would not advance the real production state.',
      rigDependentWorkMustWait: true as const,
      externalVoiceExecutionStillRequired: true as const,
      externalSceneryEvidenceStillRequired: true as const,
      humanDecisionsStillRequired: true as const,
    },
    nextArrivalSequence: [
      'Receive Goat and/or Pip canonical artist delivery.',
      'Immediately record exact byte size and SHA-256 and preserve the untouched artist source.',
      'Run the 18-check rig protocol and character-specific deformation/test-pose coverage.',
      'Stop for explicit human visual approval of each exact rig version.',
      'Bind approved rig controls into motion/expression libraries.',
      'Complete any still-outstanding real voice and scenery evidence in parallel.',
      'Issue the human animation release only when all eight animation-release gates are satisfied.',
      'Execute the ten-shot animation manifest, then final-render, publishing, and archive gates in order.',
    ],
    metrics: {
      auditRowCount: rows.length,
      planningReadyCount: rows.filter((row) => row.planningReady).length,
      softwareReadyRowCount: rows.filter((row) => row.class === 'SOFTWARE_READY').length,
      externalExecutionRowCount: rows.filter((row) => row.class === 'EXTERNAL_EXECUTION_REQUIRED').length,
      humanDecisionRowCount: rows.filter((row) => row.class === 'HUMAN_DECISION_REQUIRED').length,
      physicalCharacterAssetCountRequired: physicalAssetBlockers.length,
      physicalCharacterAssetCountPresent: 0 as const,
    },
    authority: {
      rigAdmissionGranted: false as const,
      voiceAdmissionGranted: false as const,
      sceneryAdmissionGranted: false as const,
      animationExecutionAllowed: false as const,
      paidComputeExecutionAllowed: false as const,
      productionWritesAllowed: false as const,
      publishingAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
  };

  return { ...body, preRigReadinessAuditSha256: sha256Canonical(body) };
}

export type Ep001PreRigReadinessAudit = ReturnType<typeof compileEp001PreRigReadinessAudit>;

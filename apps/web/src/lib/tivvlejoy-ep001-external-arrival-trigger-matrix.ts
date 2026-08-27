import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';

export const EP001_EXTERNAL_ARRIVAL_TRIGGER_MATRIX_SCHEMA =
  'TIVVLEJOY_EP001_EXTERNAL_ARRIVAL_TRIGGER_MATRIX_V1' as const;

export function compileEp001ExternalArrivalTriggerMatrix() {
  const gates = compileEp001HumanGatePacket();
  const triggers = [
    {
      triggerId: 'PIP_RIG_ARRIVES',
      arrivalClass: 'CHARACTER_RIG' as const,
      subject: 'CHAR_PIP_001',
      requiredArrivalEvidence: ['canonical .blend bytes', 'exact byte size', 'source SHA-256', 'artist/version note'],
      automaticSafeNextActions: ['preserve original immutably', 'record size and SHA-256', 'run static intake validation', 'prepare disposable inspection copy', 'populate Pip rig inspection worksheet'],
      blockedUntilHumanOrExplicitAuthority: ['issue rig approval', 'bind rig for final animation', 'launch paid GPU work'],
      relatedDecisionIds: ['ADMISSION:PIP_APPROVED_RIG_REQUIRED'],
    },
    {
      triggerId: 'GOAT_RIG_ARRIVES',
      arrivalClass: 'CHARACTER_RIG' as const,
      subject: 'CHAR_GOAT_001',
      requiredArrivalEvidence: ['canonical .blend bytes', 'exact byte size', 'source SHA-256', 'artist/version note'],
      automaticSafeNextActions: ['preserve original immutably', 'record size and SHA-256', 'run static intake validation', 'prepare disposable inspection copy', 'populate Goat rig inspection worksheet'],
      blockedUntilHumanOrExplicitAuthority: ['issue rig approval', 'bind rig for final animation', 'launch paid GPU work'],
      relatedDecisionIds: ['ADMISSION:GOAT_APPROVED_RIG_REQUIRED'],
    },
    {
      triggerId: 'SCENERY_LICENSE_EVIDENCE_ARRIVES',
      arrivalClass: 'LICENSE_EVIDENCE' as const,
      subject: 'EP001_SCENERY_SOURCE',
      requiredArrivalEvidence: ['exact product identity', 'purchase/order evidence', 'license text or grant', 'immutable evidence hash'],
      automaticSafeNextActions: ['validate evidence structure', 'bind candidate evidence to source ID', 'compare commercial-use terms', 'queue human license review'],
      blockedUntilHumanOrExplicitAuthority: ['mark commercial use verified', 'admit scenery source', 'redistribute source files'],
      relatedDecisionIds: gates.rows.filter((row) => row.gateClass === 'SCENERY_SOURCE').map((row) => row.decisionId),
    },
    {
      triggerId: 'VOICE_PAID_AUTHORIZATION_ARRIVES',
      arrivalClass: 'PAID_AUTHORIZATION' as const,
      subject: 'EP001_VOICE_GENERATION',
      requiredArrivalEvidence: ['explicit authorization ID', 'positive cost ceiling', 'scope limited to EP001 dialogue', 'expiry or one-shot constraint'],
      automaticSafeNextActions: ['re-run zero-cost provider/R2/text/voice preflight', 'pin authorization digest without exposing secret', 'select EP001_DL_01 as canary'],
      blockedUntilHumanOrExplicitAuthority: ['contact ElevenLabs before authorization is pinned', 'batch-generate all eight lines before canary success', 'auto-approve generated audio'],
      relatedDecisionIds: ['ADMISSION:EXACT_VOICE_RECEIPTS_REQUIRED', ...gates.rows.filter((row) => row.gateClass === 'VOICE_PERFORMANCE').map((row) => row.decisionId)],
    },
    {
      triggerId: 'HUMAN_DECISION_RECEIPT_ARRIVES',
      arrivalClass: 'HUMAN_DECISION' as const,
      subject: 'EP001_HUMAN_GATE',
      requiredArrivalEvidence: ['decision ID', 'current binding SHA-256', 'APPROVED or REJECTED', 'reviewer identity', 'review timestamp', 'evidence references', 'receipt SHA-256'],
      automaticSafeNextActions: ['validate receipt structure', 'reject stale binding hashes', 'calculate expected receipt hash', 'surface structurally valid receipt for admission processing'],
      blockedUntilHumanOrExplicitAuthority: ['infer approval from validator success alone', 'transfer approval to changed hash', 'authorize spending from unrelated approval'],
      relatedDecisionIds: gates.rows.map((row) => row.decisionId),
    },
    {
      triggerId: 'FINAL_RENDER_AUTHORIZATION_ARRIVES',
      arrivalClass: 'PAID_AUTHORIZATION' as const,
      subject: 'EP001_FINAL_RENDER',
      requiredArrivalEvidence: ['authorization ID', 'execution ID', 'exact image digest', 'positive cost ceiling', 'future expiry', 'authorization receipt hash'],
      automaticSafeNextActions: ['verify all upstream admission gates', 'verify exact render image pin', 'recalculate spend ceiling and execution scope', 'prepare one guarded render request'],
      blockedUntilHumanOrExplicitAuthority: ['launch if any upstream gate is unresolved', 'retry a failed paid render without retry authority', 'write Production automatically'],
      relatedDecisionIds: ['ADMISSION:PAID_FINAL_RENDER_AUTHORIZATION_REQUIRED'],
    },
  ] as const;

  const body = {
    schemaVersion: EP001_EXTERNAL_ARRIVAL_TRIGGER_MATRIX_SCHEMA,
    episodeId: gates.episodeId,
    humanGatePacketSha256: gates.humanGatePacketSha256,
    state: 'ARRIVAL_HANDLERS_PREPARED_EXTERNAL_INPUTS_ABSENT' as const,
    triggers,
    globalRules: [
      'Arrival detection never equals admission.',
      'Every artifact is SHA-bound before any downstream use.',
      'Original artist/commercial source bytes remain immutable.',
      'Paid provider or GPU calls require explicit current authorization.',
      'Human approval remains non-transferable across changed hashes.',
      'Production writes remain blocked on this Preview stack.',
    ],
    metrics: {
      triggerCount: triggers.length,
      characterRigTriggers: triggers.filter((trigger) => trigger.arrivalClass === 'CHARACTER_RIG').length,
      licenseTriggers: triggers.filter((trigger) => trigger.arrivalClass === 'LICENSE_EVIDENCE').length,
      humanDecisionTriggers: triggers.filter((trigger) => trigger.arrivalClass === 'HUMAN_DECISION').length,
      paidAuthorizationTriggers: triggers.filter((trigger) => trigger.arrivalClass === 'PAID_AUTHORIZATION').length,
      externalArrivalsObserved: 0 as const,
      actionsExecuted: 0 as const,
    },
    authority: {
      externalArrivalDetected: false as const,
      admissionGranted: false as const,
      paidExecutionAuthorized: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      providerCalls: 0 as const,
      blenderLaunched: false as const,
      paidRequests: 0 as const,
      productionMutations: 0 as const,
    },
  };
  return { ...body, externalArrivalTriggerMatrixSha256: sha256Canonical(body) };
}

export type Ep001ExternalArrivalTriggerMatrix = ReturnType<typeof compileEp001ExternalArrivalTriggerMatrix>;

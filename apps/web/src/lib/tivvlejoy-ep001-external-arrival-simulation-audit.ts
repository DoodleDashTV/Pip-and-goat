import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001ExternalArrivalIntakePlan } from '@/lib/tivvlejoy-ep001-external-arrival-intake-plan';
import { compileEp001HumanGatePacket } from '@/lib/tivvlejoy-ep001-human-gate-packet';
import { EP001_HUMAN_DECISION_RECEIPT_SCHEMA } from '@/lib/tivvlejoy-ep001-human-decision-receipt';

export const EP001_EXTERNAL_ARRIVAL_SIMULATION_AUDIT_SCHEMA =
  'TIVVLEJOY_EP001_EXTERNAL_ARRIVAL_SIMULATION_AUDIT_V1' as const;

const RIG_SHA = 'd'.repeat(64);
const LICENSE_SHA = 'e'.repeat(64);
const AUTH_SHA = 'f'.repeat(64);

export function compileEp001ExternalArrivalSimulationAudit() {
  const packet = compileEp001HumanGatePacket();
  const row = packet.rows[0];
  const reviewedAt = '2026-08-27T12:00:00.000Z';
  const evidenceRefs = ['synthetic://simulation-only'];
  const humanReceiptBody = {
    schemaVersion: EP001_HUMAN_DECISION_RECEIPT_SCHEMA,
    episodeId: packet.episodeId,
    decisionId: row.decisionId,
    bindingSha256: row.bindingSha256,
    decision: 'REJECTED' as const,
    reviewerId: 'synthetic-simulation-reviewer',
    reviewedAt,
    evidenceRefs,
  };

  const scenarios = [
    {
      scenarioId: 'SIM_PIP_RIG',
      input: {
        arrivalType: 'RIG' as const,
        candidate: {
          characterId: 'CHAR_PIP_001' as const,
          filename: 'Synthetic_Pip.blend',
          byteSize: 1024 * 1024,
          sha256: RIG_SHA,
          artistVersionNote: 'synthetic simulation fixture',
        },
      },
    },
    {
      scenarioId: 'SIM_GOAT_RIG',
      input: {
        arrivalType: 'RIG' as const,
        candidate: {
          characterId: 'CHAR_GOAT_001' as const,
          filename: 'Synthetic_Goat.blend',
          byteSize: 1024 * 1024,
          sha256: RIG_SHA,
          artistVersionNote: 'synthetic simulation fixture',
        },
      },
    },
    {
      scenarioId: 'SIM_SCENERY_LICENSE',
      input: {
        arrivalType: 'SCENERY_LICENSE' as const,
        candidate: {
          sourceId: 'SYNTHETIC_SCENERY_SOURCE',
          productIdentity: 'Synthetic scenery product',
          orderEvidenceRef: 'synthetic://order',
          licenseTextOrGrant: 'Synthetic simulation license grant only.',
          evidenceSha256: LICENSE_SHA,
        },
      },
    },
    {
      scenarioId: 'SIM_VOICE_AUTH',
      input: {
        arrivalType: 'PAID_AUTHORIZATION' as const,
        candidate: {
          authorizationId: 'SYNTHETIC-VOICE-AUTH',
          scope: 'EP001_VOICE_GENERATION' as const,
          costCeilingUsd: 1,
          oneShot: true,
          authorizationReceiptSha256: AUTH_SHA,
        },
      },
    },
    {
      scenarioId: 'SIM_HUMAN_DECISION',
      input: {
        arrivalType: 'HUMAN_DECISION' as const,
        candidate: {
          decisionId: row.decisionId,
          bindingSha256: row.bindingSha256,
          decision: 'REJECTED' as const,
          reviewerId: 'synthetic-simulation-reviewer',
          reviewedAt,
          evidenceRefs,
          receiptSha256: sha256Canonical(humanReceiptBody),
        },
      },
    },
    {
      scenarioId: 'SIM_FINAL_RENDER_AUTH',
      input: {
        arrivalType: 'PAID_AUTHORIZATION' as const,
        candidate: {
          authorizationId: 'SYNTHETIC-RENDER-AUTH',
          scope: 'EP001_FINAL_RENDER' as const,
          costCeilingUsd: 1,
          oneShot: true,
          authorizationReceiptSha256: AUTH_SHA,
        },
      },
    },
  ];

  const results = scenarios.map((scenario) => {
    const plan = compileEp001ExternalArrivalIntakePlan(scenario.input);
    return {
      scenarioId: scenario.scenarioId,
      syntheticFixture: true as const,
      triggerId: plan.triggerId,
      safeActionCount: plan.safeActions.length,
      blockedActionCount: plan.blockedActions.length,
      admissionGranted: plan.authority.admissionGranted,
      paidExecutionAuthorized: plan.authority.paidExecutionAuthorized,
      productionWritesAllowed: plan.authority.productionWritesAllowed,
      intakePlanSha256: plan.intakePlanSha256,
    };
  });

  const body = {
    schemaVersion: EP001_EXTERNAL_ARRIVAL_SIMULATION_AUDIT_SCHEMA,
    episodeId: 'EP001' as const,
    state: 'SYNTHETIC_HANDLER_COVERAGE_COMPLETE' as const,
    results,
    metrics: {
      scenarioCount: results.length,
      uniqueTriggerCount: new Set(results.map((result) => result.triggerId)).size,
      authorityLeakCount: results.filter(
        (result) => result.admissionGranted || result.paidExecutionAuthorized || result.productionWritesAllowed,
      ).length,
    },
    rules: [
      'Synthetic fixtures are never evidence.',
      'Synthetic receipts never satisfy human approval or paid authorization gates.',
      'Simulation may compile plans but never executes safe actions.',
    ],
  };

  return { ...body, simulationAuditSha256: sha256Canonical(body) };
}

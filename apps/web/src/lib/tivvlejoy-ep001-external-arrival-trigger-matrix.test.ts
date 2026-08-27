import { describe, expect, it } from 'vitest';
import { compileEp001ExternalArrivalTriggerMatrix, EP001_EXTERNAL_ARRIVAL_TRIGGER_MATRIX_SCHEMA } from './tivvlejoy-ep001-external-arrival-trigger-matrix';

describe('EP001 external arrival trigger matrix', () => {
  it('is deterministic and covers every external arrival class', () => {
    const first = compileEp001ExternalArrivalTriggerMatrix();
    const second = compileEp001ExternalArrivalTriggerMatrix();
    expect(first.schemaVersion).toBe(EP001_EXTERNAL_ARRIVAL_TRIGGER_MATRIX_SCHEMA);
    expect(first.externalArrivalTriggerMatrixSha256).toBe(second.externalArrivalTriggerMatrixSha256);
    expect(first.externalArrivalTriggerMatrixSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.metrics.triggerCount).toBe(6);
    expect(first.metrics.characterRigTriggers).toBe(2);
    expect(first.metrics.licenseTriggers).toBe(1);
    expect(first.metrics.humanDecisionTriggers).toBe(1);
    expect(first.metrics.paidAuthorizationTriggers).toBe(2);
  });

  it('never turns arrival into authority', () => {
    const compiled = compileEp001ExternalArrivalTriggerMatrix();
    expect(compiled.metrics.externalArrivalsObserved).toBe(0);
    expect(compiled.metrics.actionsExecuted).toBe(0);
    expect(compiled.authority.externalArrivalDetected).toBe(false);
    expect(compiled.authority.admissionGranted).toBe(false);
    expect(compiled.authority.paidExecutionAuthorized).toBe(false);
    expect(compiled.authority.productionWritesAllowed).toBe(false);
    expect(compiled.authority.autoApprovalAllowed).toBe(false);
    expect(compiled.safety.providerCalls).toBe(0);
    expect(compiled.safety.blenderLaunched).toBe(false);
    expect(compiled.safety.paidRequests).toBe(0);
  });

  it('keeps paid execution canary-first and retry-fail-closed', () => {
    const compiled = compileEp001ExternalArrivalTriggerMatrix();
    const voice = compiled.triggers.find((trigger) => trigger.triggerId === 'VOICE_PAID_AUTHORIZATION_ARRIVES');
    const render = compiled.triggers.find((trigger) => trigger.triggerId === 'FINAL_RENDER_AUTHORIZATION_ARRIVES');
    expect(voice?.automaticSafeNextActions).toContain('select EP001_DL_01 as canary');
    expect(voice?.blockedUntilHumanOrExplicitAuthority).toContain('batch-generate all eight lines before canary success');
    expect(render?.blockedUntilHumanOrExplicitAuthority).toContain('retry a failed paid render without retry authority');
  });
});

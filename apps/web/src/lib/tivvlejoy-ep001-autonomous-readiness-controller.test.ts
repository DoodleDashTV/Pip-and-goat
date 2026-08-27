import { describe, expect, it } from 'vitest';
import { compileEp001AutonomousReadinessController } from '@/lib/tivvlejoy-ep001-autonomous-readiness-controller';

describe('compileEp001AutonomousReadinessController', () => {
  it('starts at the external-input boundary with no executable authority', () => {
    const controller = compileEp001AutonomousReadinessController();
    expect(controller.state).toBe('EXTERNAL_INPUT_BOUNDARY');
    expect(controller.metrics.knownTriggers).toBe(6);
    expect(controller.metrics.observedTriggers).toBe(0);
    expect(controller.metrics.waitingTriggers).toBe(6);
    expect(controller.metrics.queuedSafeActions).toBe(0);
    expect(controller.authority).toEqual({
      admissionGranted: false,
      humanApprovalGranted: false,
      paidProviderExecutionAuthorized: false,
      paidGpuExecutionAuthorized: false,
      productionWritesAllowed: false,
      autoApprovalAllowed: false,
    });
  });

  it('queues only safe intake actions when a known arrival is observed', () => {
    const controller = compileEp001AutonomousReadinessController({
      observedTriggerIds: ['PIP_RIG_ARRIVES'],
    });
    expect(controller.state).toBe('SAFE_INTAKE_ACTIONS_AVAILABLE');
    expect(controller.metrics.observedTriggers).toBe(1);
    expect(controller.metrics.waitingTriggers).toBe(5);
    expect(controller.metrics.queuedSafeActions).toBe(5);
    expect(controller.safeAutomaticActionQueue.every((item) => item.triggerId === 'PIP_RIG_ARRIVES')).toBe(true);
    expect(controller.safeAutomaticActionQueue.every((item) => item.authorityLevel === 'ZERO_COST_INTAKE_ONLY')).toBe(true);
    expect(controller.authority.admissionGranted).toBe(false);
    expect(controller.authority.paidGpuExecutionAuthorized).toBe(false);
  });

  it('fails closed on unknown arrival IDs', () => {
    expect(() =>
      compileEp001AutonomousReadinessController({ observedTriggerIds: ['UNKNOWN_TRIGGER'] }),
    ).toThrow('UNKNOWN_EP001_EXTERNAL_TRIGGER:UNKNOWN_TRIGGER');
  });

  it('is deterministic for the same observations', () => {
    const a = compileEp001AutonomousReadinessController({
      observedTriggerIds: ['GOAT_RIG_ARRIVES', 'PIP_RIG_ARRIVES'],
    });
    const b = compileEp001AutonomousReadinessController({
      observedTriggerIds: ['GOAT_RIG_ARRIVES', 'PIP_RIG_ARRIVES'],
    });
    expect(a.autonomousReadinessControllerSha256).toBe(b.autonomousReadinessControllerSha256);
  });
});

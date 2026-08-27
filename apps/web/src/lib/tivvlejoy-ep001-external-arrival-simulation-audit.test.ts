import { describe, expect, it } from 'vitest';
import { compileEp001ExternalArrivalSimulationAudit } from '@/lib/tivvlejoy-ep001-external-arrival-simulation-audit';

describe('compileEp001ExternalArrivalSimulationAudit', () => {
  it('covers all six external-arrival handlers without authority leakage', () => {
    const audit = compileEp001ExternalArrivalSimulationAudit();
    expect(audit.metrics.scenarioCount).toBe(6);
    expect(audit.metrics.uniqueTriggerCount).toBe(6);
    expect(audit.metrics.authorityLeakCount).toBe(0);
    expect(audit.results.every((result) => result.syntheticFixture)).toBe(true);
    expect(audit.results.every((result) => result.safeActionCount > 0)).toBe(true);
    expect(audit.results.every((result) => result.admissionGranted === false)).toBe(true);
    expect(audit.results.every((result) => result.paidExecutionAuthorized === false)).toBe(true);
    expect(audit.results.every((result) => result.productionWritesAllowed === false)).toBe(true);
  });

  it('is deterministic', () => {
    const a = compileEp001ExternalArrivalSimulationAudit();
    const b = compileEp001ExternalArrivalSimulationAudit();
    expect(a.simulationAuditSha256).toBe(b.simulationAuditSha256);
  });
});

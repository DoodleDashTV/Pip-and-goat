import { describe, expect, it } from 'vitest';
import { compileEp001CrossContractIntegrityAudit } from '@/lib/tivvlejoy-ep001-cross-contract-integrity';

describe('compileEp001CrossContractIntegrityAudit', () => {
  it('proves the current decision, trigger, scheduler, and simulation IDs align', () => {
    const audit = compileEp001CrossContractIntegrityAudit();
    expect(audit.integrityPass).toBe(true);
    expect(audit.metrics.decisionIdCount).toBe(23);
    expect(audit.metrics.uniqueDecisionIdCount).toBe(23);
    expect(audit.metrics.triggerIdCount).toBe(6);
    expect(audit.metrics.uniqueTriggerIdCount).toBe(6);
    expect(audit.metrics.simulationCoveredTriggerCount).toBe(6);
    expect(audit.metrics.issueCount).toBe(0);
    expect(audit.authority.autoRepairAllowed).toBe(false);
  });

  it('is deterministic', () => {
    const a = compileEp001CrossContractIntegrityAudit();
    const b = compileEp001CrossContractIntegrityAudit();
    expect(a.crossContractIntegritySha256).toBe(b.crossContractIntegritySha256);
  });
});

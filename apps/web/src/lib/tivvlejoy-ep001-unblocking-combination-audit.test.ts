import { describe, expect, it } from 'vitest';
import { compileEp001UnblockingCombinationAudit } from '@/lib/tivvlejoy-ep001-unblocking-combination-audit';

describe('compileEp001UnblockingCombinationAudit', () => {
  it('audits all 64 subsets of six external triggers without authority leaks', () => {
    const audit = compileEp001UnblockingCombinationAudit();
    expect(audit.metrics.triggerCount).toBe(6);
    expect(audit.metrics.combinationCount).toBe(64);
    expect(audit.metrics.authorityLeakCount).toBe(0);
    expect(audit.metrics.invalidFoundationAccounting).toBe(0);
    expect(audit.combinations[0]?.observedCount).toBe(0);
    expect(audit.combinations.at(-1)?.observedCount).toBe(6);
    expect(audit.authority.auditMayExecuteActions).toBe(false);
  });

  it('has 16 combinations where all four foundation inputs are present', () => {
    const audit = compileEp001UnblockingCombinationAudit();
    expect(audit.metrics.combinationsWithFoundationComplete).toBe(16);
  });

  it('is deterministic', () => {
    const a = compileEp001UnblockingCombinationAudit();
    const b = compileEp001UnblockingCombinationAudit();
    expect(a.unblockingCombinationAuditSha256).toBe(b.unblockingCombinationAuditSha256);
  });
});

import { describe, expect, it } from 'vitest';
import { compileEp001ExternalHandoffPackage } from '@/lib/tivvlejoy-ep001-external-handoff-package';

describe('compileEp001ExternalHandoffPackage', () => {
  it('packages four foundation requests with verified fail-closed coverage', () => {
    const packet = compileEp001ExternalHandoffPackage();
    expect(packet.foundationRequests).toHaveLength(4);
    expect(packet.verification.crossContractIntegrityPass).toBe(true);
    expect(packet.verification.crossContractIssueCount).toBe(0);
    expect(packet.verification.simulatedCombinationCount).toBe(64);
    expect(packet.verification.simulatedAuthorityLeakCount).toBe(0);
    expect(packet.verification.humanDecisionRows).toBe(23);
    expect(packet.verification.humanApprovalsIssued).toBe(0);
    expect(packet.authority.evidenceReceived).toBe(false);
    expect(packet.authority.paidExecutionAuthorized).toBe(false);
  });

  it('retains evidence requirements and post-arrival gates for every foundation request', () => {
    const packet = compileEp001ExternalHandoffPackage();
    expect(packet.foundationRequests.every((request) => request.requiredEvidence.length > 0)).toBe(true);
    expect(packet.foundationRequests.every((request) => request.safeActionsAfterArrival.length > 0)).toBe(true);
    expect(packet.foundationRequests.every((request) => request.stillBlockedAfterArrival.length > 0)).toBe(true);
  });

  it('is deterministic', () => {
    const a = compileEp001ExternalHandoffPackage();
    const b = compileEp001ExternalHandoffPackage();
    expect(a.externalHandoffPackageSha256).toBe(b.externalHandoffPackageSha256);
  });
});

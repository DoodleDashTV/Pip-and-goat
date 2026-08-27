import { describe, expect, it } from 'vitest';
import { compileEp001FoundationImpactMap, EP001_FOUNDATION_IMPACT_MAP_SCHEMA } from './tivvlejoy-ep001-foundation-impact-map';

describe('EP001 foundation impact map', () => {
  it('binds all foundation inputs to known decision rows', () => {
    const map = compileEp001FoundationImpactMap();
    expect(map.schemaVersion).toBe(EP001_FOUNDATION_IMPACT_MAP_SCHEMA);
    expect(map.metrics.foundationInputCount).toBe(4);
    expect(map.metrics.totalDecisionCount).toBe(23);
    expect(map.metrics.impactIntegrityFailureCount).toBe(0);
    expect(map.inputs.every((input) => input.impactIntegrityPass)).toBe(true);
    expect(map.foundationImpactMapSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('shows rig, scenery and voice review impact without granting authority', () => {
    const map = compileEp001FoundationImpactMap();
    const byTrigger = new Map(map.inputs.map((input) => [input.triggerId, input]));
    expect(byTrigger.get('PIP_RIG_ARRIVES')?.impactedDecisionCount).toBe(1);
    expect(byTrigger.get('GOAT_RIG_ARRIVES')?.impactedDecisionCount).toBe(1);
    expect(byTrigger.get('SCENERY_LICENSE_EVIDENCE_ARRIVES')?.impactedDecisionCount).toBe(8);
    expect(byTrigger.get('VOICE_PAID_AUTHORIZATION_ARRIVES')?.impactedDecisionCount).toBe(9);
    expect(map.authority.admissionGranted).toBe(false);
    expect(map.authority.humanApprovalGranted).toBe(false);
    expect(map.authority.paidExecutionAuthorized).toBe(false);
  });
});

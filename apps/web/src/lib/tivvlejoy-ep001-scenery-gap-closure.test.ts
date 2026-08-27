import { describe, expect, it } from 'vitest';
import { compileEp001SceneryGapClosure, EP001_SCENERY_GAP_CLOSURE_SCHEMA } from './tivvlejoy-ep001-scenery-gap-closure';

describe('EP001 scenery gap closure', () => {
  it('is deterministic and covers all 17 semantic slots', () => {
    const a = compileEp001SceneryGapClosure();
    const b = compileEp001SceneryGapClosure();
    expect(a.schemaVersion).toBe(EP001_SCENERY_GAP_CLOSURE_SCHEMA);
    expect(a.sceneryGapClosureSha256).toBe(b.sceneryGapClosureSha256);
    expect(a.metrics.totalSlots).toBe(17);
    expect(a.metrics.unresolvedCapabilitySlots).toBe(0);
  });

  it('uses real flora evidence for flowers and native recipes for signage/path', () => {
    const packet = compileEp001SceneryGapClosure();
    const flower = packet.slots.find((slot) => slot.semanticRole === 'FLOWERS');
    expect(flower?.capabilityState).toBe('REAL_SOURCE_CANDIDATE_OBSERVED');
    expect(flower?.closureRef).toContain('PROCEDURAL_FLORA_LIBRARY_V1');
    expect(packet.slots.filter((slot) => slot.semanticRole === 'PATH')).toHaveLength(3);
    expect(packet.slots.filter((slot) => slot.semanticRole === 'PATH').every((slot) => slot.capabilityState === 'NATIVE_RECIPE_PREPARED')).toBe(true);
    expect(packet.slots.find((slot) => slot.semanticRole === 'SIGNAGE')?.capabilityState).toBe('NATIVE_RECIPE_PREPARED');
  });

  it('does not convert capability into admission or approval', () => {
    const packet = compileEp001SceneryGapClosure();
    expect(packet.metrics.admittedSlots).toBe(0);
    expect(packet.authority.licensesVerified).toBe(false);
    expect(packet.authority.blenderExecutionCompleted).toBe(false);
    expect(packet.authority.humanVisualApprovalIssued).toBe(false);
    expect(packet.authority.sceneryAdmissionGranted).toBe(false);
    expect(packet.authority.autoApprovalAllowed).toBe(false);
    expect(packet.safety.paidRequests).toBe(0);
  });
});

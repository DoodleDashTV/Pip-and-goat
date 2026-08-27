import { describe, expect, it } from 'vitest';
import { compileEp001AutonomousControlRoom } from '@/lib/tivvlejoy-ep001-autonomous-control-room';

describe('compileEp001AutonomousControlRoom', () => {
  it('consolidates the current fail-closed EP001 state', () => {
    const room = compileEp001AutonomousControlRoom();
    expect(room.headline.humanDecisionRows).toBe(23);
    expect(room.headline.humanApprovalsIssued).toBe(0);
    expect(room.headline.externalTriggers).toBe(6);
    expect(room.headline.observedExternalTriggers).toBe(0);
    expect(room.headline.safeActionsQueuedNow).toBe(0);
    expect(room.headline.foundationInputsWaiting).toBe(4);
    expect(room.headline.syntheticScenariosCovered).toBe(6);
    expect(room.headline.syntheticAuthorityLeaks).toBe(0);
    expect(room.headline.crossContractIntegrityPass).toBe(true);
    expect(room.headline.crossContractIssueCount).toBe(0);
    expect(room.integrity.pass).toBe(true);
    expect(room.nextRequiredExternalInputs).toHaveLength(4);
    expect(room.authority.admissionGranted).toBe(false);
    expect(room.authority.paidGpuExecutionAuthorized).toBe(false);
  });

  it('is deterministic', () => {
    const a = compileEp001AutonomousControlRoom();
    const b = compileEp001AutonomousControlRoom();
    expect(a.autonomousControlRoomSha256).toBe(b.autonomousControlRoomSha256);
  });
});

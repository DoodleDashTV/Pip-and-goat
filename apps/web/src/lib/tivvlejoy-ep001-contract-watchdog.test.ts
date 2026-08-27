import { describe, expect, it } from 'vitest';
import {
  compileCurrentEp001ContractSnapshot,
  evaluateEp001ContractWatchdog,
} from '@/lib/tivvlejoy-ep001-contract-watchdog';

describe('EP001 contract watchdog', () => {
  it('reports current when hashes match exactly', () => {
    const snapshot = compileCurrentEp001ContractSnapshot();
    const report = evaluateEp001ContractWatchdog(snapshot);
    expect(report.stale).toBe(false);
    expect(report.changes).toHaveLength(0);
    expect(report.invalidations.invalidateStoredHumanDecisionReceipts).toBe(false);
    expect(report.invalidations.invalidateStoredExternalArrivalReceipts).toBe(false);
    expect(report.authority.autoMigrationAllowed).toBe(false);
  });

  it('invalidates human receipts when the human-gate hash drifts', () => {
    const snapshot = compileCurrentEp001ContractSnapshot();
    const report = evaluateEp001ContractWatchdog({
      ...snapshot,
      humanGatePacketSha256: '0'.repeat(64),
    });
    expect(report.stale).toBe(true);
    expect(report.invalidations.invalidateStoredHumanDecisionReceipts).toBe(true);
    expect(report.invalidations.rerunReadinessSimulation).toBe(true);
    expect(report.authority.admissionGranted).toBe(false);
  });

  it('invalidates external arrival receipts when the trigger-matrix hash drifts', () => {
    const snapshot = compileCurrentEp001ContractSnapshot();
    const report = evaluateEp001ContractWatchdog({
      ...snapshot,
      externalArrivalTriggerMatrixSha256: '1'.repeat(64),
    });
    expect(report.stale).toBe(true);
    expect(report.invalidations.invalidateStoredExternalArrivalReceipts).toBe(true);
    expect(report.authority.paidExecutionAuthorized).toBe(false);
  });
});

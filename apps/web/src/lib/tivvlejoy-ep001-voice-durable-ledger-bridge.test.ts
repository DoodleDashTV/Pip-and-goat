import { describe, expect, it } from 'vitest';
import { compileEp001VoiceDurableLedgerBridge, EP001_VOICE_DURABLE_LEDGER_BRIDGE_SCHEMA } from './tivvlejoy-ep001-voice-durable-ledger-bridge';

describe('EP001 durable voice ledger bridge', () => {
  it('binds all eight exact production lines deterministically', () => {
    const a = compileEp001VoiceDurableLedgerBridge();
    const b = compileEp001VoiceDurableLedgerBridge();
    expect(a.schemaVersion).toBe(EP001_VOICE_DURABLE_LEDGER_BRIDGE_SCHEMA);
    expect(a.voiceDurableLedgerBridgeSha256).toBe(b.voiceDurableLedgerBridgeSha256);
    expect(a.metrics.lineCount).toBe(8);
    expect(a.metrics.pipLineCount).toBe(5);
    expect(a.metrics.goatLineCount).toBe(3);
    expect(new Set(a.rows.map((row) => row.idempotencyKey)).size).toBe(8);
  });

  it('records the proven durable architecture separately from EP001 execution', () => {
    const packet = compileEp001VoiceDurableLedgerBridge();
    expect(packet.provenLedgerArchitecture.architectureProvenByPriorRealExecution).toBe(true);
    expect(packet.provenLedgerArchitecture.observedSucceededExecutionCount).toBe(11);
    expect(packet.provenLedgerArchitecture.ep001ExecutionPerformed).toBe(false);
    expect(packet.executionSurface.durableDatabaseReachable).toBe(true);
    expect(packet.executionSurface.currentConnectedProviderInvokerAvailable).toBe(false);
  });

  it('never fabricates audio, storage, alignment, or approval evidence', () => {
    const packet = compileEp001VoiceDurableLedgerBridge();
    for (const row of packet.rows) {
      expect(row.status).toBe('NOT_EXECUTED');
      expect(row.audioSha256).toBeNull();
      expect(row.audioBytes).toBeNull();
      expect(row.storageVerified).toBe(false);
      expect(row.alignmentPresent).toBe(false);
      expect(row.humanApprovalReceiptSha256).toBeNull();
    }
    expect(packet.authority.durableReceiptAdmissionGranted).toBe(false);
    expect(packet.safety.voiceProviderCalls).toBe(0);
    expect(packet.safety.paidRequests).toBe(0);
  });
});

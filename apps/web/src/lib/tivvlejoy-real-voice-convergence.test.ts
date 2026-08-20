import { describe, expect, it } from 'vitest';
import { VOICE_CONVERGENCE_SCHEMA, bindEp012VoiceReceipts, convergeVoiceReceipts } from './tivvlejoy-real-input-convergence';

describe('TIVVLEJOY_REAL_VOICE_RECEIPT_CONVERGENCE_V1', () => {
  it('does not treat synthetic EP012 fixtures as real receipts', () => {
    const report = bindEp012VoiceReceipts();
    expect(report.schemaVersion).toBe(VOICE_CONVERGENCE_SCHEMA);
    expect(report.pipConfirmedRealReceipts).toBe(0);
    expect(report.goatConfirmedRealReceipts).toBe(0);
    expect(report.exactTimingReceipts).toBe(0);
    expect(report.wordTimingReceipts).toBe(0);
    expect(report.lineTimingReceipts).toBe(0);
    expect(report.externalVoiceVendorCalled).toBe(false);
    expect(report.voiceIdentityMutated).toBe(false);
    expect(report.bindings.some((item) => item.timingReality === 'SYNTHETIC_ONLY' || item.timingReality === 'MISSING_REAL_AUDIO')).toBe(true);
    expect(report.bindings.every((item) => item.realReceipt === false)).toBe(true);
  });

  it('binds only persisted real receipts and marks missing lines', () => {
    const report = convergeVoiceReceipts({
      persisted: [
        {
          dialogueRef: 'DL_HOOK_01',
          characterId: 'PIP',
          receiptRef: 'real-hook',
          receiptSha256: 'aa'.repeat(32),
          realAudioPresent: true,
          lineTimingPresent: true,
        },
      ],
    });
    const hook = report.bindings.find((item) => item.dialogueRef === 'DL_HOOK_01');
    expect(hook?.timingReality).toBe('REAL_LINE_TIMING');
    expect(report.pipConfirmedRealReceipts).toBe(1);
    expect(report.bindings.find((item) => item.dialogueRef === 'DL_PAYOFF_01')?.timingReality).toBe('MISSING_REAL_AUDIO');
  });

  it('never substitutes synthetic audio while claiming real', () => {
    const report = bindEp012VoiceReceipts();
    expect(report.bindings.filter((item) => item.syntheticOnly).every((item) => item.receiptRef === null)).toBe(true);
  });
});

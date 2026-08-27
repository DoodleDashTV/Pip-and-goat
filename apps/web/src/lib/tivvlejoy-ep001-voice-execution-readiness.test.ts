import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_VOICE_EXECUTION_READINESS_SCHEMA,
  compileEp001VoiceExecutionReadiness,
} from './tivvlejoy-ep001-voice-execution-readiness';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_EP001_VOICE_EXECUTION_READINESS_V1', () => {
  it('compiles deterministically and binds to the audio cue sheet', () => {
    const first = compileEp001VoiceExecutionReadiness();
    const second = compileEp001VoiceExecutionReadiness();
    expect(first.schemaVersion).toBe(EP001_VOICE_EXECUTION_READINESS_SCHEMA);
    expect(first.voiceExecutionReadinessSha256).toBe(second.voiceExecutionReadinessSha256);
    expect(first.voiceExecutionReadinessSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.audioCueSheetSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('prepares all eight exact dialogue lines without claiming generation', () => {
    const packet = compileEp001VoiceExecutionReadiness();
    expect(packet.lines).toHaveLength(8);
    expect(packet.metrics.lineCount).toBe(8);
    expect(packet.metrics.generatedLineCount).toBe(0);
    expect(packet.metrics.approvedLineCount).toBe(0);
    expect(packet.lines.every((line) => line.generationState === 'NOT_GENERATED')).toBe(true);
    expect(packet.lines.every((line) => line.audioSha256 === null && line.timingSha256 === null)).toBe(true);
  });

  it('keeps provider execution, admission, lip-sync, and approval closed', () => {
    const packet = compileEp001VoiceExecutionReadiness();
    expect(packet.authority.providerExecutionPerformed).toBe(false);
    expect(packet.authority.realAudioPresent).toBe(false);
    expect(packet.authority.voiceReceiptAdmissionGranted).toBe(false);
    expect(packet.authority.finalLipSyncAllowed).toBe(false);
    expect(packet.authority.autoApprovalAllowed).toBe(false);
    expect(packet.safety.voiceProviderCalls).toBe(0);
    expect(packet.safety.paidRequests).toBe(0);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/voice-execution-readiness/page.tsx');
    expect(page).toContain('Voice execution readiness');
    expect(page).toContain('compileEp001VoiceExecutionReadiness()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

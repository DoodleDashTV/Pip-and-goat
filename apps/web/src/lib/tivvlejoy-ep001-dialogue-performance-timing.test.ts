import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_DIALOGUE_PERFORMANCE_TIMING_SCHEMA,
  compileEp001DialoguePerformanceTiming,
} from './tivvlejoy-ep001-dialogue-performance-timing';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_EP001_DIALOGUE_PERFORMANCE_TIMING_V1', () => {
  it('compiles deterministically and binds audio plus artist checkpoint identities', () => {
    const first = compileEp001DialoguePerformanceTiming();
    const second = compileEp001DialoguePerformanceTiming();
    expect(first.schemaVersion).toBe(EP001_DIALOGUE_PERFORMANCE_TIMING_SCHEMA);
    expect(first.timingManifestSha256).toBe(second.timingManifestSha256);
    expect(first.timingManifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.audioCueSheetSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.artistCheckpointSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves eight picture-locked line windows without fabricating speech timing', () => {
    const timing = compileEp001DialoguePerformanceTiming();
    expect(timing.lines).toHaveLength(8);
    expect(timing.metrics.dialogueLineCount).toBe(8);
    expect(timing.lines.every((line) => !line.approvedAudioBinding.bound && line.performanceEvidence.wordTimingSegments.length === 0 && line.performanceEvidence.phonemeOrVisemeSegments.length === 0)).toBe(true);
    expect(timing.lines.every((line) => line.reviewState === 'AWAITING_APPROVED_AUDIO_AND_ADMITTED_RIG')).toBe(true);
  });

  it('keeps final facial execution blocked until exact audio and rigs are approved', () => {
    const timing = compileEp001DialoguePerformanceTiming();
    expect(timing.qualityGates).toHaveLength(8);
    expect(timing.authority.realAudioBound).toBe(false);
    expect(timing.authority.admittedRigsBound).toBe(false);
    expect(timing.authority.facialAnimationExecutionAllowed).toBe(false);
    expect(timing.authority.finalLipSyncAllowed).toBe(false);
    expect(timing.authority.paidComputeAllowed).toBe(false);
    expect(timing.authority.productionWritesAllowed).toBe(false);
    expect(timing.safety.keyframesAuthored).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/dialogue-performance/page.tsx');
    expect(page).toContain('Dialogue performance timing');
    expect(page).toContain('compileEp001DialoguePerformanceTiming()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

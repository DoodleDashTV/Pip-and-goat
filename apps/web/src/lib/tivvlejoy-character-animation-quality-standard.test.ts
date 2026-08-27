import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_ANIMATION_QUALITY_STANDARD_SCHEMA,
  compileCharacterAnimationQualityStandard,
} from './tivvlejoy-character-animation-quality-standard';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_CHARACTER_ANIMATION_QUALITY_STANDARD_V1', () => {
  it('compiles deterministically and binds to dialogue timing', () => {
    const first = compileCharacterAnimationQualityStandard();
    const second = compileCharacterAnimationQualityStandard();
    expect(first.schemaVersion).toBe(CHARACTER_ANIMATION_QUALITY_STANDARD_SCHEMA);
    expect(first.qualityStandardSha256).toBe(second.qualityStandardSha256);
    expect(first.qualityStandardSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.dialogueTimingManifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('defines twelve pillars, six passes, and character-specific rules', () => {
    const standard = compileCharacterAnimationQualityStandard();
    expect(standard.pillars).toHaveLength(12);
    expect(standard.reviewPasses).toHaveLength(6);
    expect(standard.characterRules.PIP).toHaveLength(5);
    expect(standard.characterRules.GOAT).toHaveLength(5);
    expect(standard.pillars.every((pillar) => pillar.humanReviewRequired && !pillar.autoApprovalAllowed)).toBe(true);
  });

  it('explicitly rejects low-quality mechanical animation patterns', () => {
    const standard = compileCharacterAnimationQualityStandard();
    const rejectionText = standard.rejectionTriggers.join(' ');
    expect(rejectionText).toContain('robotic');
    expect(rejectionText).toContain('sliding');
    expect(rejectionText).toContain('Mechanical lip-sync');
    expect(standard.authority.animationExecutionAllowed).toBe(false);
    expect(standard.authority.finalAnimationApprovalIssued).toBe(false);
    expect(standard.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/animation-quality-standard/page.tsx');
    expect(page).toContain('Animation quality standard');
    expect(page).toContain('compileCharacterAnimationQualityStandard()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

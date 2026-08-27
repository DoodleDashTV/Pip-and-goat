import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_ANIMATION_EXECUTION_MANIFEST_SCHEMA,
  compileEp001AnimationExecutionManifest,
} from './tivvlejoy-ep001-animation-execution-manifest';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_EP001_ANIMATION_EXECUTION_MANIFEST_V1', () => {
  it('compiles deterministically and binds to release/blocking/expression contracts', () => {
    const first = compileEp001AnimationExecutionManifest();
    const second = compileEp001AnimationExecutionManifest();
    expect(first.schemaVersion).toBe(EP001_ANIMATION_EXECUTION_MANIFEST_SCHEMA);
    expect(first.executionManifestSha256).toBe(second.executionManifestSha256);
    expect(first.executionManifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.animationBlockingBoardSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.animationReleaseGateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.expressionPoseLibrarySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('defines 10 shot tasks with seven execution passes each', () => {
    const manifest = compileEp001AnimationExecutionManifest();
    expect(manifest.shotTasks).toHaveLength(10);
    expect(manifest.metrics.shotTaskCount).toBe(10);
    expect(manifest.metrics.executionPassCountPerShot).toBe(7);
    expect(manifest.metrics.totalPlannedShotPasses).toBe(70);
    expect(manifest.shotTasks.every((shot) => shot.executionPasses.length === 7)).toBe(true);
  });

  it('keeps every shot blocked and exact rig/source identities empty', () => {
    const manifest = compileEp001AnimationExecutionManifest();
    for (const shot of manifest.shotTasks) {
      expect(shot.state).toBe('NOT_EXECUTED_BLOCKED_BY_ANIMATION_RELEASE');
      expect(shot.sourceAnimationSha256).toBeNull();
      expect(shot.playblastSha256).toBeNull();
      expect(shot.humanApproved).toBe(false);
      expect(shot.rigBindings.every((binding) => binding.exactRigSha256 === null && binding.rigAdmissionReceiptRef === null)).toBe(true);
    }
    expect(manifest.authority.animationReleaseIssued).toBe(false);
    expect(manifest.authority.shotExecutionAllowed).toBe(false);
    expect(manifest.authority.blenderExecutionAllowed).toBe(false);
    expect(manifest.authority.paidComputeAllowed).toBe(false);
    expect(manifest.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/animation-execution/page.tsx');
    expect(page).toContain('Animation execution manifest');
    expect(page).toContain('compileEp001AnimationExecutionManifest()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

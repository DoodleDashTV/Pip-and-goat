import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_EXPRESSION_POSE_LIBRARY_SCHEMA,
  compileCharacterExpressionPoseLibrary,
} from './tivvlejoy-character-expression-pose-library';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_CHARACTER_EXPRESSION_POSE_LIBRARY_V1', () => {
  it('compiles deterministically and binds to the motion library', () => {
    const first = compileCharacterExpressionPoseLibrary();
    const second = compileCharacterExpressionPoseLibrary();
    expect(first.schemaVersion).toBe(CHARACTER_EXPRESSION_POSE_LIBRARY_SCHEMA);
    expect(first.expressionPoseLibrarySha256).toBe(second.expressionPoseLibrarySha256);
    expect(first.expressionPoseLibrarySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.motionLibraryContractSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('defines 17 expressions and 7 dialogue shapes per character', () => {
    const library = compileCharacterExpressionPoseLibrary();
    expect(library.metrics.characterCount).toBe(2);
    expect(library.metrics.expressionSpecCountPerCharacter).toBe(17);
    expect(library.metrics.dialogueShapeSpecCountPerCharacter).toBe(7);
    expect(library.metrics.totalPlannedReusablePoses).toBe(48);
    expect(library.metrics.authoredPoseCount).toBe(0);
    expect(library.metrics.approvedPoseCount).toBe(0);
  });

  it('keeps rig bindings, lip-sync, paid compute, and approvals closed', () => {
    const library = compileCharacterExpressionPoseLibrary();
    for (const character of library.characters) {
      expect(character.exactRigSha256).toBeNull();
      expect(character.expressions.every((pose) => pose.poseSha256 === null && !pose.humanApproved)).toBe(true);
      expect(character.dialogueShapes.every((pose) => pose.rigControlBinding === null && pose.poseSha256 === null && !pose.humanApproved)).toBe(true);
    }
    expect(library.authority.admittedRigsPresent).toBe(false);
    expect(library.authority.poseAuthoringAllowed).toBe(false);
    expect(library.authority.finalLipSyncAllowed).toBe(false);
    expect(library.authority.paidComputeAllowed).toBe(false);
    expect(library.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/expression-library/page.tsx');
    expect(page).toContain('Character expression library');
    expect(page).toContain('compileCharacterExpressionPoseLibrary()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

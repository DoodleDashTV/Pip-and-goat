import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_MOTION_LIBRARY_CONTRACT_SCHEMA,
  compileCharacterMotionLibraryContract,
} from './tivvlejoy-character-motion-library-contract';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_CHARACTER_MOTION_LIBRARY_CONTRACT_V1', () => {
  it('compiles deterministically and binds to the quality standard', () => {
    const first = compileCharacterMotionLibraryContract();
    const second = compileCharacterMotionLibraryContract();
    expect(first.schemaVersion).toBe(CHARACTER_MOTION_LIBRARY_CONTRACT_SCHEMA);
    expect(first.motionLibraryContractSha256).toBe(second.motionLibraryContractSha256);
    expect(first.motionLibraryContractSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.qualityStandardSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('defines 22 shared motions plus 6 character-specific motions each', () => {
    const library = compileCharacterMotionLibraryContract();
    expect(library.metrics.sharedMotionSpecCount).toBe(22);
    expect(library.metrics.pipSpecificMotionSpecCount).toBe(6);
    expect(library.metrics.goatSpecificMotionSpecCount).toBe(6);
    expect(library.metrics.pipTotalMotionSpecCount).toBe(28);
    expect(library.metrics.goatTotalMotionSpecCount).toBe(28);
    expect(library.metrics.authoredMotionCount).toBe(0);
    expect(library.metrics.approvedMotionCount).toBe(0);
  });

  it('keeps every motion unbound and unapproved until exact rigs exist', () => {
    const library = compileCharacterMotionLibraryContract();
    for (const character of library.characters) {
      for (const motion of character.motions) {
        expect(motion.exactRigSha256).toBeNull();
        expect(motion.actionSha256).toBeNull();
        expect(motion.reviewState).toBe('NOT_AUTHORED_NOT_REVIEWED');
        expect(motion.humanApproved).toBe(false);
      }
    }
    expect(library.authority.admittedRigsPresent).toBe(false);
    expect(library.authority.motionAuthoringAllowed).toBe(false);
    expect(library.authority.libraryPublishingAllowed).toBe(false);
    expect(library.authority.paidComputeAllowed).toBe(false);
    expect(library.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/motion-library/page.tsx');
    expect(page).toContain('Character motion library');
    expect(page).toContain('compileCharacterMotionLibraryContract()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

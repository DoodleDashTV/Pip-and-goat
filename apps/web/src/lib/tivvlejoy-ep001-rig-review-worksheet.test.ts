import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_RIG_REVIEW_WORKSHEET_SCHEMA,
  compileEp001RigReviewWorksheet,
} from './tivvlejoy-ep001-rig-review-worksheet';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_RIG_REVIEW_WORKSHEET_V1', () => {
  it('compiles deterministically and stays bound to the inspection protocol', () => {
    const first = compileEp001RigReviewWorksheet();
    const second = compileEp001RigReviewWorksheet();
    expect(first.schemaVersion).toBe(EP001_RIG_REVIEW_WORKSHEET_SCHEMA);
    expect(first.episodeId).toBe('EP001');
    expect(first.worksheetSha256).toBe(second.worksheetSha256);
    expect(first.worksheetSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.inspectionProtocolSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('prepares exact Pip and Goat review rows without pretending evidence exists', () => {
    const worksheet = compileEp001RigReviewWorksheet();
    const pip = worksheet.characters.find((character) => character.characterId === 'PIP')!;
    const goat = worksheet.characters.find((character) => character.characterId === 'GOAT')!;

    expect(pip.rows).toHaveLength(17);
    expect(pip.requiredTestPoses).toHaveLength(13);
    expect(goat.rows).toHaveLength(16);
    expect(goat.requiredTestPoses).toHaveLength(11);
    expect([...pip.rows, ...goat.rows].every((row) => row.result === 'NOT_REVIEWED')).toBe(true);
    expect(pip.sourceSha256).toBeNull();
    expect(goat.sourceSha256).toBeNull();
    expect(pip.humanDecision).toBe('NOT_ISSUED');
    expect(goat.humanDecision).toBe('NOT_ISSUED');
  });

  it('keeps all execution and approval authority closed', () => {
    const worksheet = compileEp001RigReviewWorksheet();
    expect(worksheet.authority.realRigPresent).toBe(false);
    expect(worksheet.authority.evidenceRecorded).toBe(false);
    expect(worksheet.authority.humanVisualApprovalIssued).toBe(false);
    expect(worksheet.authority.rigAdmissionGranted).toBe(false);
    expect(worksheet.authority.animationExecutionAllowed).toBe(false);
    expect(worksheet.authority.paidComputeAllowed).toBe(false);
    expect(worksheet.authority.productionWritesAllowed).toBe(false);
  });

  it('keeps the Studio worksheet route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/rig-review/page.tsx');
    expect(page).toContain('Rig review worksheet');
    expect(page).toContain('compileEp001RigReviewWorksheet()');
    expect(page).toContain('Waiting for artist delivery');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

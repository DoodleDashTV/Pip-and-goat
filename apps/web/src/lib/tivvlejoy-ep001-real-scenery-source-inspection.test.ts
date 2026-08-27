import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_REAL_SCENERY_SOURCE_INSPECTION_SCHEMA,
  compileEp001RealScenerySourceInspection,
} from './tivvlejoy-ep001-real-scenery-source-inspection';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_EP001_REAL_SCENERY_SOURCE_INSPECTION_V1', () => {
  it('compiles deterministically from observed real-source evidence', () => {
    const first = compileEp001RealScenerySourceInspection();
    const second = compileEp001RealScenerySourceInspection();
    expect(first.schemaVersion).toBe(EP001_REAL_SCENERY_SOURCE_INSPECTION_SCHEMA);
    expect(first.realScenerySourceInspectionSha256).toBe(second.realScenerySourceInspectionSha256);
    expect(first.realScenerySourceInspectionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.metrics.inspectedSourceCount).toBe(6);
  });

  it('records exact observed Village and support source hashes without granting admission', () => {
    const report = compileEp001RealScenerySourceInspection();
    expect(report.sources.find((source) => source.sourceId === 'VILLAGE_FBX_V1')?.sha256)
      .toBe('1d5eefbea277aeb9f2dcc546e72eeec5ca364b83468740c6d27285ac50c355ad');
    expect(report.sources.find((source) => source.sourceId === 'VILLAGE_BLEND_402_V1')?.sha256)
      .toBe('c836125e3f63bd7c1e9f992f919ccd903956ee43f8d9a3a0a84423e8365f8ee9');
    expect(report.sources.find((source) => source.sourceId === 'FOREST_TEXTURES_4096_V1')?.sha256)
      .toBe('ff2b2d921c5c68dd4d0f846a720a2c4a0229d578eb303845f90f3aa4740abeca');
    expect(report.sources.every((source) => source.archiveIntegrityVerified)).toBe(true);
    expect(report.sources.every((source) => !source.licenseVerified && !source.humanApproved && !source.admissionGranted)).toBe(true);
  });

  it('keeps execution and auto-approval closed', () => {
    const report = compileEp001RealScenerySourceInspection();
    expect(report.authority.staticInspectionComplete).toBe(true);
    expect(report.authority.realSourceBytesObserved).toBe(true);
    expect(report.authority.sceneryAdmissionGranted).toBe(false);
    expect(report.authority.blenderExecutionAllowed).toBe(false);
    expect(report.authority.paidComputeAllowed).toBe(false);
    expect(report.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/scenery-source-inspection/page.tsx');
    expect(page).toContain('Real scenery source inspection');
    expect(page).toContain('compileEp001RealScenerySourceInspection()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

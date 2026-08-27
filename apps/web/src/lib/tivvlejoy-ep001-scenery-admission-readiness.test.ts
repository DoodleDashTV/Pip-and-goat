import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_SCENERY_ADMISSION_READINESS_SCHEMA,
  compileEp001SceneryAdmissionReadiness,
} from './tivvlejoy-ep001-scenery-admission-readiness';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_EP001_SCENERY_ADMISSION_READINESS_V1', () => {
  it('compiles deterministically and binds to the scenery pull sheet', () => {
    const first = compileEp001SceneryAdmissionReadiness();
    const second = compileEp001SceneryAdmissionReadiness();
    expect(first.schemaVersion).toBe(EP001_SCENERY_ADMISSION_READINESS_SCHEMA);
    expect(first.sceneryAdmissionReadinessSha256).toBe(second.sceneryAdmissionReadinessSha256);
    expect(first.sceneryAdmissionReadinessSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sceneryPullSheetSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves all logical locations and keeps every real source unresolved', () => {
    const packet = compileEp001SceneryAdmissionReadiness();
    expect(packet.metrics.locationCount).toBeGreaterThan(0);
    expect(packet.metrics.shotCount).toBe(10);
    expect(packet.metrics.semanticSlotCount).toBeGreaterThan(0);
    expect(packet.metrics.resolvedSlotCount).toBe(0);
    expect(packet.metrics.approvedSlotCount).toBe(0);
    expect(packet.slots.every((slot) => slot.sourceSha256 === null && slot.licenseReceiptSha256 === null)).toBe(true);
  });

  it('keeps scenery admission and execution blocked', () => {
    const packet = compileEp001SceneryAdmissionReadiness();
    expect(packet.authority.realBindingsPresent).toBe(false);
    expect(packet.authority.bindingManifestApproved).toBe(false);
    expect(packet.authority.sceneryAdmissionGranted).toBe(false);
    expect(packet.authority.blenderAssemblyAllowed).toBe(false);
    expect(packet.authority.paidComputeAllowed).toBe(false);
    expect(packet.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/scenery-admission-readiness/page.tsx');
    expect(page).toContain('Scenery admission readiness');
    expect(page).toContain('compileEp001SceneryAdmissionReadiness()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_PUBLISHING_RELEASE_GATE_SCHEMA,
  compileEp001PublishingReleaseGate,
} from './tivvlejoy-ep001-publishing-release-gate';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_PUBLISHING_RELEASE_GATE_V1', () => {
  it('compiles deterministically and binds to final-render release', () => {
    const first = compileEp001PublishingReleaseGate();
    const second = compileEp001PublishingReleaseGate();
    expect(first.schemaVersion).toBe(EP001_PUBLISHING_RELEASE_GATE_SCHEMA);
    expect(first.publishingGateSha256).toBe(second.publishingGateSha256);
    expect(first.publishingGateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.finalRenderReleaseGateSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('locks final media delivery spec and nine review checks', () => {
    const gate = compileEp001PublishingReleaseGate();
    expect(gate.mediaChecks).toHaveLength(9);
    expect(gate.deliverySpec).toMatchObject({ width: 1080, height: 1920, aspectRatio: '9:16', fps: 30, totalFrames: 1800, durationSeconds: 60, audioRequired: true });
    expect(gate.mediaChecks.every((item) => item.state === 'NOT_REVIEWED')).toBe(true);
  });

  it('keeps destinations and uploads unselected and unauthorized', () => {
    const gate = compileEp001PublishingReleaseGate();
    expect(gate.destinations).toHaveLength(3);
    expect(gate.destinations.every((item) => !item.selected && !item.uploadAuthorized)).toBe(true);
    expect(gate.authority.finalMediaPresent).toBe(false);
    expect(gate.authority.mediaQaPassed).toBe(false);
    expect(gate.authority.humanPublishingApprovalIssued).toBe(false);
    expect(gate.authority.uploadAllowed).toBe(false);
    expect(gate.authority.scheduledPublishingAllowed).toBe(false);
    expect(gate.authority.productionWritesAllowed).toBe(false);
    expect(gate.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/publishing-release/page.tsx');
    expect(page).toContain('Publishing release gate');
    expect(page).toContain('compileEp001PublishingReleaseGate()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

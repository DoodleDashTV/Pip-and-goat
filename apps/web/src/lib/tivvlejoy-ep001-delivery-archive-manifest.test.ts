import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_DELIVERY_ARCHIVE_MANIFEST_SCHEMA,
  compileEp001DeliveryArchiveManifest,
} from './tivvlejoy-ep001-delivery-archive-manifest';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_DELIVERY_ARCHIVE_MANIFEST_V1', () => {
  it('compiles deterministically and binds to publishing release', () => {
    const first = compileEp001DeliveryArchiveManifest();
    const second = compileEp001DeliveryArchiveManifest();
    expect(first.schemaVersion).toBe(EP001_DELIVERY_ARCHIVE_MANIFEST_SCHEMA);
    expect(first.archiveManifestSha256).toBe(second.archiveManifestSha256);
    expect(first.archiveManifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.publishingReleaseGateSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('defines ten canonical delivery artifacts with no false presence', () => {
    const archive = compileEp001DeliveryArchiveManifest();
    expect(archive.artifacts).toHaveLength(10);
    expect(archive.artifacts.every((item) => !item.present && item.artifactSha256 === null && item.byteSize === null)).toBe(true);
    expect(archive.artifacts.map((item) => item.artifactId)).toContain('FINAL_MEDIA');
    expect(archive.artifacts.map((item) => item.artifactId)).toContain('PIP_RIG');
    expect(archive.artifacts.map((item) => item.artifactId)).toContain('GOAT_RIG');
  });

  it('keeps archive writes, publishing, and production fail-closed', () => {
    const archive = compileEp001DeliveryArchiveManifest();
    expect(archive.authority.realArtifactsPresent).toBe(false);
    expect(archive.authority.archiveComplete).toBe(false);
    expect(archive.authority.archiveWriteAllowed).toBe(false);
    expect(archive.authority.publishingAllowed).toBe(false);
    expect(archive.authority.productionWritesAllowed).toBe(false);
    expect(archive.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/delivery-archive/page.tsx');
    expect(page).toContain('Delivery archive manifest');
    expect(page).toContain('compileEp001DeliveryArchiveManifest()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

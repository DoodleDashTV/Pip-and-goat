import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_REVIEW_EXPORT_SCHEMA,
  EP001_REVIEW_ITEMS,
  EP001_REVIEW_STORAGE_KEY,
  EP001_REVIEW_WORKSHEET_SCHEMA,
  buildEp001ReviewExport,
  createEmptyEp001ReviewWorksheet,
  parseEp001ReviewWorksheet,
  readEp001ReviewWorksheet,
  writeEp001ReviewWorksheet,
  type Ep001ReviewStorage,
} from './tivvlejoy-ep001-review-worksheet';

const repoRoot = path.resolve(__dirname, '../../../..');
const PACKAGE_SHA = 'a'.repeat(64);

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

function memoryStorage(): Ep001ReviewStorage & { value(): string | null } {
  let stored: string | null = null;
  return {
    getItem: (key) => (key === EP001_REVIEW_STORAGE_KEY ? stored : null),
    setItem: (key, value) => {
      if (key === EP001_REVIEW_STORAGE_KEY) stored = value;
    },
    value: () => stored,
  };
}

describe('TIVVLEJOY_EP001_REVIEW_WORKSHEET_V1', () => {
  it('starts empty and cannot grant any authority', () => {
    const worksheet = createEmptyEp001ReviewWorksheet(PACKAGE_SHA);
    expect(worksheet.schemaVersion).toBe(EP001_REVIEW_WORKSHEET_SCHEMA);
    expect(worksheet.disposition).toBe('IN_REVIEW');
    expect(worksheet.completedItemIds).toEqual([]);
    expect(worksheet.canonicalApprovalIssued).toBe(false);
    expect(worksheet.visualApprovalIssued).toBe(false);
    expect(worksheet.productionWriteAllowed).toBe(false);
  });

  it('round-trips only the versioned browser worksheet', () => {
    const storage = memoryStorage();
    const worksheet = {
      ...createEmptyEp001ReviewWorksheet(PACKAGE_SHA),
      disposition: 'NEEDS_CHANGES' as const,
      completedItemIds: [EP001_REVIEW_ITEMS[0].id, EP001_REVIEW_ITEMS[2].id],
      notes: 'Make the opening map fragment slightly easier to see.',
      savedAt: '2026-08-25T14:00:00.000Z',
    };

    expect(writeEp001ReviewWorksheet(storage, worksheet)).toBe(true);
    expect(readEp001ReviewWorksheet(storage, PACKAGE_SHA)).toEqual(worksheet);
  });

  it('rejects stale package bindings and authority tampering', () => {
    const clean = createEmptyEp001ReviewWorksheet(PACKAGE_SHA);
    expect(
      parseEp001ReviewWorksheet(
        JSON.stringify({ ...clean, packageSha256: 'b'.repeat(64) }),
        PACKAGE_SHA,
      ),
    ).toBeNull();
    expect(
      parseEp001ReviewWorksheet(
        JSON.stringify({ ...clean, canonicalApprovalIssued: true }),
        PACKAGE_SHA,
      ),
    ).toBeNull();
    expect(
      parseEp001ReviewWorksheet(
        JSON.stringify({ ...clean, productionWriteAllowed: true }),
        PACKAGE_SHA,
      ),
    ).toBeNull();
  });

  it('fails closed when browser storage is unavailable or corrupt', () => {
    const unavailable: Ep001ReviewStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readEp001ReviewWorksheet(unavailable, PACKAGE_SHA)).toEqual(
      createEmptyEp001ReviewWorksheet(PACKAGE_SHA),
    );
    expect(
      writeEp001ReviewWorksheet(unavailable, createEmptyEp001ReviewWorksheet(PACKAGE_SHA)),
    ).toBe(false);
    expect(parseEp001ReviewWorksheet('{not-json', PACKAGE_SHA)).toBeNull();
  });

  it('exports a handoff record without approval, execution, or publishing authority', () => {
    const exported = buildEp001ReviewExport(
      createEmptyEp001ReviewWorksheet(PACKAGE_SHA),
      '2026-08-25T14:00:00.000Z',
    );
    expect(exported.schemaVersion).toBe(EP001_REVIEW_EXPORT_SCHEMA);
    expect(exported.authority).toEqual({
      clearsReadinessBlockers: false,
      countsAsHumanStoryApproval: false,
      countsAsHumanVisualApproval: false,
      permitsPaidExecution: false,
      permitsPublishing: false,
    });
  });

  it('wires the worksheet into EP001 without adding a network or server mutation', () => {
    const page = readRepo('apps/web/src/app/episode-one/page.tsx');
    const component = readRepo('apps/web/src/components/preview/Ep001ReviewWorksheet.tsx');
    expect(page).toContain('Ep001ReviewWorksheet');
    expect(page).toContain("['#worksheet', 'Review worksheet']");
    expect(component).toContain("'use client'");
    expect(component).toContain('window.localStorage');
    expect(component).toContain('Export review handoff');
    expect(component).not.toContain('fetch(');
    expect(component).not.toContain("'use server'");
    expect(component).not.toContain('<form');
    expect(component).not.toContain('humanStoryApproval: true');
  });
});

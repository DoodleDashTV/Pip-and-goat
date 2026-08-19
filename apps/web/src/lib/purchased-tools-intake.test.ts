import { describe, expect, it } from 'vitest';
import {
  PURCHASED_TOOL_PACKAGES,
  findPurchasedToolPackageByFilename,
  validatePurchasedToolSelection,
} from './purchased-tools/catalog';
import { planPurchasedToolParts } from './purchased-tools/intake-server';

const TODAY_USER_SUPPLIED_PACKAGE_FILENAMES = [
  'physical-starlight-atmosphere-1.5.3.zip',
  'botaniq_full_geoscatter_biomes-7.0.0.scatpack.zip',
  'Gaffer 3.1.18 (for b3.2).zip',
  'physical-starlight-atmosphere-1.1.zip',
  'Gaffer 3.0.4 (for b2.79).zip',
  'physical-starlight-atmosphere-1.7.1.zip',
  'physical-starlight-atmosphere-1.3.2.zip',
  'physical-starlight-atmosphere-1.8.3.zip',
  'botaniq_full_geoscatter_biomes-7.1.1.scatpack.zip',
  'physical-starlight-atmosphere-1.2.3.zip',
  'physical_starlight_atmosphere-1.9.4.zip',
  'physical-starlight-atmosphere-1.4.4beta.zip',
  'Gaffer 3.2.10 (for b3.4+) - latest.zip',
  'Gaffer 3.1.5 (for b2.8).zip',
  'physical-starlight-atmosphere-1.9.2.zip',
  'physical-starlight-atmosphere-1.6.1.zip',
  'physical-starlight-atmosphere-1.8.3 2.zip',
  'botaniq_full-7.2.0.paq.zip',
] as const;

describe('TivvleJoy iPhone large purchased asset intake', () => {
  it('accepts every exact purchased package filename supplied by the user today', () => {
    expect(TODAY_USER_SUPPLIED_PACKAGE_FILENAMES).toHaveLength(18);
    for (const filename of TODAY_USER_SUPPLIED_PACKAGE_FILENAMES) {
      expect(findPurchasedToolPackageByFilename(filename), filename).not.toBeNull();
    }
  });

  it('keeps the selected current candidates active while older downloads are intake/storage only', () => {
    expect(findPurchasedToolPackageByFilename('Gaffer 3.2.10 (for b3.4+) - latest.zip')?.activation).toBe(
      'INSTALL_LATER',
    );
    expect(findPurchasedToolPackageByFilename('physical_starlight_atmosphere-1.9.4.zip')?.activation).toBe(
      'INSTALL_LATER',
    );
    expect(findPurchasedToolPackageByFilename('Gaffer 3.1.18 (for b3.2).zip')?.activation).toBe(
      'STORE_ONLY',
    );
    expect(findPurchasedToolPackageByFilename('physical-starlight-atmosphere-1.9.2.zip')?.activation).toBe(
      'STORE_ONLY',
    );
    expect(
      findPurchasedToolPackageByFilename('botaniq_full_geoscatter_biomes-7.1.1.scatpack.zip')
        ?.activation,
    ).toBe('OPTIONAL_NOT_INTEGRATED');
    expect(
      findPurchasedToolPackageByFilename('botaniq_full_geoscatter_biomes-7.0.0.scatpack.zip')
        ?.activation,
    ).toBe('OPTIONAL_NOT_INTEGRATED');
  });

  it('accepts a 5.15 GiB-class Botaniq Full file under the dedicated 8 GiB cap', () => {
    const selection = validatePurchasedToolSelection({
      filename: 'botaniq_full-7.2.0.paq',
      byteSize: Math.floor(5.15 * 1024 ** 3),
    });
    expect(selection.ok).toBe(true);
  });

  it('accepts the exact Superhive/iPhone Botaniq .paq.zip wrapper without accepting arbitrary renames', () => {
    const wrapped = validatePurchasedToolSelection({
      filename: 'botaniq_full-7.2.0.paq.zip',
      byteSize: Math.floor(4.8 * 1024 ** 3),
    });
    expect(wrapped.ok).toBe(true);
    expect(findPurchasedToolPackageByFilename('botaniq_full-7.2.0.paq.zip')?.sourceId).toBe(
      'SRC_BOTANIQ_FULL_7_2_0',
    );
  });

  it('rejects the tiny failed Botaniq download instead of uploading it', () => {
    const selection = validatePurchasedToolSelection({
      filename: 'botaniq_full-7.2.0.paq.zip',
      byteSize: 135,
    });
    expect(selection.ok).toBe(false);
  });

  it('uses 32 MiB chunks so large iPhone uploads can resume granularly', () => {
    const size = Math.floor(5.15 * 1024 ** 3);
    const parts = planPurchasedToolParts(size);
    expect(parts.length).toBeGreaterThan(150);
    expect(parts.length).toBeLessThan(200);
    expect(parts[0]).toMatchObject({ partNumber: 1, start: 0, end: 32 * 1024 * 1024, etag: null });
    expect(parts.at(-1)?.end).toBe(size);
  });

  it('refuses renamed or unapproved package filenames', () => {
    expect(
      validatePurchasedToolSelection({ filename: 'botaniq-full-renamed.paq', byteSize: 5 * 1024 ** 3 }).ok,
    ).toBe(false);
    expect(
      validatePurchasedToolSelection({ filename: 'botaniq_full-7.2.0-copy.paq.zip', byteSize: 5 * 1024 ** 3 }).ok,
    ).toBe(false);
    expect(findPurchasedToolPackageByFilename('Gaffer renamed.zip')).toBeNull();
  });

  it('uses unique source ids for the two separately named PSA 1.8.3 downloads', () => {
    const first = findPurchasedToolPackageByFilename('physical-starlight-atmosphere-1.8.3.zip');
    const second = findPurchasedToolPackageByFilename('physical-starlight-atmosphere-1.8.3 2.zip');
    expect(first?.sourceId).not.toBe(second?.sourceId);
    expect(first?.activation).toBe('STORE_ONLY');
    expect(second?.activation).toBe('STORE_ONLY');
  });

  it('keeps the catalog free of duplicate source ids and exact expected filenames', () => {
    const sourceIds = PURCHASED_TOOL_PACKAGES.map((item) => item.sourceId);
    const filenames = PURCHASED_TOOL_PACKAGES.map((item) => item.expectedFilename);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(new Set(filenames).size).toBe(filenames.length);
  });
});

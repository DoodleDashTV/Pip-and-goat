import { describe, expect, it } from 'vitest';
import {
  PURCHASED_TOOL_PACKAGES,
  findPurchasedToolPackageByFilename,
  validatePurchasedToolSelection,
} from './purchased-tools/catalog';
import { planPurchasedToolParts } from './purchased-tools/intake-server';

describe('TivvleJoy iPhone large purchased asset intake', () => {
  it('pins the approved current package filenames without activating optional Geo-Scatter', () => {
    expect(PURCHASED_TOOL_PACKAGES.map((item) => item.expectedFilename)).toEqual([
      'botaniq_full-7.2.0.paq',
      'Gaffer 3.2.10 (for b3.4+) - latest.zip',
      'physical_starlight_atmosphere-1.9.4.zip',
      'botaniq_full_geoscatter_biomes-7.1.1.scatpack.zip',
    ]);
    expect(
      findPurchasedToolPackageByFilename('botaniq_full_geoscatter_biomes-7.1.1.scatpack.zip')
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

  it('rejects the tiny failed Botaniq download instead of uploading it', () => {
    const selection = validatePurchasedToolSelection({
      filename: 'botaniq_full-7.2.0.paq',
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
  });
});

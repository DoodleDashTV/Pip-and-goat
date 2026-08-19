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
  'assets-for-v1.6.1-and-below 2.blend.zip',
  'physical-starlight-atmosphere-1.8.3 2.zip',
  'botaniq_full-7.2.0.paq.zip',
  '3DT_Mountain_Pack_Blender.zip',
  '3DT_Pack_Mountains_GLB.glb',
  'FBX and Textures.zip',
  'UE5_3DT_Pack_Mountains.zip',
  'LouisBGMountainsV1.zip',
  'Stylized Tavern Package.fbx',
  'stylized tavern textures.zip',
  'Stylized Tavern Interior.blend',
  'Stylized Tavern Package.zip',
  'Stylized Tavern Interior.blend.zip',
] as const;

const ORIGINAL_NEW_SCENERY_FILENAMES = [
  '3DT_Mountain_Pack_Blender.zip',
  '3DT_Pack_Mountains_GLB.glb',
  'FBX and Textures.zip',
  'UE5_3DT_Pack_Mountains.zip',
  'LouisBGMountainsV1.zip',
  'Stylized Tavern Package.fbx',
  'stylized tavern textures.zip',
  'Stylized Tavern Interior.blend',
] as const;

const TAVERN_WRAPPER_FILENAMES = [
  'Stylized Tavern Package.zip',
  'Stylized Tavern Interior.blend.zip',
] as const;

describe('TivvleJoy iPhone large purchased asset intake', () => {
  it('accepts every exact purchased/source filename selected by the user today', () => {
    expect(TODAY_USER_SUPPLIED_PACKAGE_FILENAMES).toHaveLength(29);
    for (const filename of TODAY_USER_SUPPLIED_PACKAGE_FILENAMES) {
      expect(findPurchasedToolPackageByFilename(filename), filename).not.toBeNull();
    }
  });

  it('keeps the eight newly purchased original scenery sources STORE_ONLY until inspection', () => {
    expect(ORIGINAL_NEW_SCENERY_FILENAMES).toHaveLength(8);
    for (const filename of ORIGINAL_NEW_SCENERY_FILENAMES) {
      const found = findPurchasedToolPackageByFilename(filename);
      expect(found, filename).not.toBeNull();
      expect(found?.role, filename).toBe('asset-library');
      expect(found?.activation, filename).toBe('STORE_ONLY');
    }
  });

  it('accepts the two exact iPhone tavern ZIP wrappers with separate archival source ids', () => {
    const ids = TAVERN_WRAPPER_FILENAMES.map((filename) => {
      const found = findPurchasedToolPackageByFilename(filename);
      expect(found, filename).not.toBeNull();
      expect(found?.activation, filename).toBe('STORE_ONLY');
      expect(found?.version, filename).toBe('1-wrapper');
      return found?.sourceId;
    });
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain('SRC_STYLIZED_TAVERN_PACKAGE_FBX');
    expect(ids).not.toContain('SRC_STYLIZED_TAVERN_INTERIOR_BLEND');
  });

  it('keeps current tool candidates active while older downloads remain storage only', () => {
    expect(findPurchasedToolPackageByFilename('Gaffer 3.2.10 (for b3.4+) - latest.zip')?.activation).toBe('INSTALL_LATER');
    expect(findPurchasedToolPackageByFilename('physical_starlight_atmosphere-1.9.4.zip')?.activation).toBe('INSTALL_LATER');
    expect(findPurchasedToolPackageByFilename('Gaffer 3.1.18 (for b3.2).zip')?.activation).toBe('STORE_ONLY');
    expect(findPurchasedToolPackageByFilename('physical-starlight-atmosphere-1.9.2.zip')?.activation).toBe('STORE_ONLY');
    expect(findPurchasedToolPackageByFilename('assets-for-v1.6.1-and-below 2.blend.zip')?.activation).toBe('STORE_ONLY');
    expect(findPurchasedToolPackageByFilename('botaniq_full_geoscatter_biomes-7.1.1.scatpack.zip')?.activation).toBe('OPTIONAL_NOT_INTEGRATED');
    expect(findPurchasedToolPackageByFilename('botaniq_full_geoscatter_biomes-7.0.0.scatpack.zip')?.activation).toBe('OPTIONAL_NOT_INTEGRATED');
  });

  it('accepts direct GLB, FBX and BLEND source formats at plausible sizes', () => {
    expect(validatePurchasedToolSelection({ filename: '3DT_Pack_Mountains_GLB.glb', byteSize: Math.floor(1.24 * 1024 ** 3) }).ok).toBe(true);
    expect(validatePurchasedToolSelection({ filename: 'Stylized Tavern Package.fbx', byteSize: 8 * 1024 ** 2 }).ok).toBe(true);
    expect(validatePurchasedToolSelection({ filename: 'Stylized Tavern Interior.blend', byteSize: 9 * 1024 ** 2 }).ok).toBe(true);
  });

  it('accepts screenshot-confirmed mountain and tavern size classes', () => {
    expect(validatePurchasedToolSelection({ filename: 'LouisBGMountainsV1.zip', byteSize: Math.floor(5.3 * 1024 ** 2) }).ok).toBe(true);
    expect(validatePurchasedToolSelection({ filename: 'stylized tavern textures.zip', byteSize: Math.floor(326.4 * 1024 ** 2) }).ok).toBe(true);
  });

  it('accepts plausible tavern ZIP wrapper sizes without treating arbitrary names as approved', () => {
    expect(validatePurchasedToolSelection({ filename: 'Stylized Tavern Package.zip', byteSize: 8 * 1024 ** 2 }).ok).toBe(true);
    expect(validatePurchasedToolSelection({ filename: 'Stylized Tavern Interior.blend.zip', byteSize: 9 * 1024 ** 2 }).ok).toBe(true);
    expect(findPurchasedToolPackageByFilename('Stylized Tavern Package copy.zip')).toBeNull();
    expect(findPurchasedToolPackageByFilename('Stylized Tavern Interior copy.blend.zip')).toBeNull();
  });

  it('accepts the legacy Physical Starlight companion bundle at the selected iPhone size class', () => {
    const selection = validatePurchasedToolSelection({ filename: 'assets-for-v1.6.1-and-below 2.blend.zip', byteSize: Math.floor(1.9 * 1024 ** 2) });
    expect(selection.ok).toBe(true);
    expect(selection.ok && selection.package.role).toBe('optional-companion');
  });

  it('accepts a 5.15 GiB-class Botaniq Full file under the dedicated 8 GiB cap', () => {
    expect(validatePurchasedToolSelection({ filename: 'botaniq_full-7.2.0.paq', byteSize: Math.floor(5.15 * 1024 ** 3) }).ok).toBe(true);
  });

  it('rejects the tiny failed Botaniq download', () => {
    expect(validatePurchasedToolSelection({ filename: 'botaniq_full-7.2.0.paq.zip', byteSize: 135 }).ok).toBe(false);
  });

  it('uses 32 MiB chunks so large iPhone uploads can resume granularly', () => {
    const size = Math.floor(5.15 * 1024 ** 3);
    const parts = planPurchasedToolParts(size);
    expect(parts.length).toBeGreaterThan(150);
    expect(parts.length).toBeLessThan(200);
    expect(parts[0]).toMatchObject({ partNumber: 1, start: 0, end: 32 * 1024 * 1024, etag: null });
    expect(parts.at(-1)?.end).toBe(size);
  });

  it('still refuses unrelated renamed filenames', () => {
    expect(validatePurchasedToolSelection({ filename: 'botaniq-full-renamed.paq', byteSize: 5 * 1024 ** 3 }).ok).toBe(false);
    expect(validatePurchasedToolSelection({ filename: 'botaniq_full-7.2.0-copy.paq.zip', byteSize: 5 * 1024 ** 3 }).ok).toBe(false);
    expect(findPurchasedToolPackageByFilename('Gaffer renamed.zip')).toBeNull();
    expect(findPurchasedToolPackageByFilename('assets-for-v1.6.1-and-below.blend.zip')).toBeNull();
  });

  it('uses unique source ids for the two separately named PSA 1.8.3 downloads', () => {
    const first = findPurchasedToolPackageByFilename('physical-starlight-atmosphere-1.8.3.zip');
    const second = findPurchasedToolPackageByFilename('physical-starlight-atmosphere-1.8.3 2.zip');
    expect(first?.sourceId).not.toBe(second?.sourceId);
  });

  it('keeps the catalog free of duplicate source ids and exact expected filenames', () => {
    const sourceIds = PURCHASED_TOOL_PACKAGES.map((item) => item.sourceId);
    const filenames = PURCHASED_TOOL_PACKAGES.map((item) => item.expectedFilename);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(new Set(filenames).size).toBe(filenames.length);
  });
});

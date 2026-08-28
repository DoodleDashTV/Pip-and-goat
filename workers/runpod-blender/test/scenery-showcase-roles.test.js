'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  REQUIRED_ROLES,
  NATURE_LIBRARY_ALIAS_KEY,
  NATURE_LIBRARY_ALIAS_SOURCE_KEY,
  independentRoleSnapshot,
  trySelectAssets,
} = require('../src/scenery-showcase-roles');

const V3_LIVE_INVENTORY = [
  { key: 'tivvlejoy-assets/source/purchased-blender-tools/SRC_3DT_MOUNTAIN_PACK_GLB/3DT_Pack_Mountains_GLB.glb', size: 1548419288 },
  { key: 'tivvlejoy-assets/source/purchased-blender-tools/SRC_LOUIS_BG_MOUNTAINS_V1/LouisBGMountainsV1.zip', size: 536976191 },
  { key: 'tivvlejoy-assets/source/stylized-forest/Stylized_Forest_Nature_Kit.zip', size: 692830820 },
  { key: 'tivvlejoy-assets/source/stylized-forest/Stylised EcoKit.zip', size: 669481428 },
  { key: 'tivvlejoy-assets/showcase-compat/forest_textures_4096.zip', size: 669481428 },
  { key: 'tivvlejoy-assets/showcase-compat/Water_Mat_GN.zip', size: 62075 },
  { key: 'tivvlejoy-assets/source/village/Village _FBX_.zip', size: 2148090 },
  { key: 'tivvlejoy-assets/source/village/Village _Textures_.zip', size: 72051550 },
  { key: 'tivvlejoy-assets/source/purchased-blender-tools/SRC_STYLIZED_TAVERN_INTERIOR_BLEND_ZIP_WRAPPER/Stylized Tavern Interior.blend.zip', size: 1883236 },
  { key: 'tivvlejoy-assets/source/purchased-blender-tools/SRC_BOTANIQ_FULL_7_2_0/botaniq_full-7.2.0.paq.zip', size: 5153837530 },
  { key: 'tivvlejoy-assets/source/purchased-blender-tools/SRC_BOTANIQ_GEOSCATTER_BIOMES_7_1_1/botaniq_full_geoscatter_biomes-7.1.1.scatpack.zip', size: 5603659 },
  { key: 'tivvlejoy-assets/catalogs/purchased-tool-receipts/SRC_BOTANIQ_GEOSCATTER_BIOMES_7_1_1.json', size: 714 },
  { key: 'tivvlejoy-assets/source/sky-hdri/HDRi_JPG_Pack.zip', size: 943197192 },
  { key: 'tivvlejoy-assets/source/sky-hdri/SkyMachineV2.zip', size: 51240289 },
  { key: 'tivvlejoy-assets/source/sky-hdri/Giveaway_World Shaders.zip', size: 711398 },
];

const NATURE_ALIAS = {
  key: NATURE_LIBRARY_ALIAS_KEY,
  size: 692830820,
};

test('independent preflight reports 12/12 on the V3 inventory that the worker rejected', () => {
  const snapshot = independentRoleSnapshot(V3_LIVE_INVENTORY);
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.satisfiedRoleCount, 12);
  assert.deepEqual(snapshot.missingRoles, []);
});

test('worker unique-key + maxBytes selection fails nature_library on the V3 inventory', () => {
  const result = trySelectAssets(V3_LIVE_INVENTORY);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SCENERY_ROLE_MISSING');
  assert.equal(result.missingRole, 'nature_library');
  const rejected = result.inspection.rejected;
  assert.equal(
    rejected.some((item) => item.key.includes('botaniq_full-7.2.0.paq.zip') && item.reasons.includes('maxBytes>900MiB')),
    true,
  );
  assert.equal(
    rejected.some((item) => item.key.includes('geoscatter_biomes') && item.reasons.includes('exclude')),
    true,
  );
});

test('a private purchased-nature alias under 900 MiB satisfies all 12 distinct worker roles', () => {
  const result = trySelectAssets([...V3_LIVE_INVENTORY, NATURE_ALIAS]);
  assert.equal(result.ok, true);
  assert.equal(result.selected.length, REQUIRED_ROLES.length);
  const nature = result.selected.find((item) => item.role === 'nature_library');
  assert.equal(nature.key, NATURE_LIBRARY_ALIAS_KEY);
  assert.equal(nature.size, NATURE_ALIAS.size);
  assert.ok(nature.size <= 900 * 1024 * 1024);
  const keys = result.selected.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(result.totalBytes <= 5 * 1024 * 1024 * 1024);
});

test('nature alias source is the purchased forest nature kit, not a fabricated package', () => {
  assert.equal(NATURE_LIBRARY_ALIAS_SOURCE_KEY, 'tivvlejoy-assets/source/stylized-forest/Stylized_Forest_Nature_Kit.zip');
  assert.match(NATURE_LIBRARY_ALIAS_KEY, /Assets Library\.zip$/);
});

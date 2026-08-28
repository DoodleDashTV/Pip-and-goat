'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { REQUIRED_ROLES, SOURCE_SPECS, EXTRA_SOURCE_SPECS, selectAssets, trySelectAssets, selectExtraAssets } = require('../src/scenery-showcase-original14-roles');

const INVENTORY = SOURCE_SPECS.map((spec, i) => ({
  key: `tivvlejoy-assets/source/${spec.sourceId}/${spec.filename}`,
  size: spec.unityPreservationOnly ? 10_000_000 + i : 80_000_000 + i * 1_000_000,
}));

test('Original-14 contract selects 14/11/3/4 from purchased filenames', () => {
  const result = selectAssets(INVENTORY);
  assert.equal(result.originalSourceCount, 14);
  assert.equal(result.renderableSourceCount, 11);
  assert.equal(result.unityPreservationOnlyCount, 3);
  assert.equal(result.collectionCount, 4);
  assert.deepEqual(REQUIRED_ROLES, SOURCE_SPECS.map((x) => x.role));
});

test('Louis background mountains are selected as a purchased extra without breaking the 14', () => {
  const inventory = INVENTORY.concat([
    { key: 'tivvlejoy-assets/source/purchased-blender-tools/SRC_LOUIS_BG_MOUNTAINS_V1/LouisBGMountainsV1.zip', size: 536_976_191 },
  ]);
  const result = selectAssets(inventory);
  assert.equal(result.originalSourceCount, 14);
  const extras = selectExtraAssets(inventory, new Set(result.selected.map((x) => x.key)), { alreadyBytes: result.totalBytes });
  assert.equal(extras.extraSourceCount, 1);
  assert.equal(extras.selected[0].sourceId, 'SRC_LOUIS_BG_MOUNTAINS_V1');
  assert.equal(EXTRA_SOURCE_SPECS[0].role, 'background_mountains');
});

test('missing purchased forest kit fails closed', () => {
  const missing = INVENTORY.filter((item) => !item.key.includes('Stylized_Forest_Nature_Kit.zip'));
  const result = trySelectAssets(missing);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ORIGINAL_14_SOURCE_MISSING');
  assert.equal(result.missingRole, 'forest_nature');
});

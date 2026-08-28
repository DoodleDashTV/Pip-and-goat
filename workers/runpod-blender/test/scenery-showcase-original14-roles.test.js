'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { REQUIRED_ROLES, SOURCE_SPECS, selectAssets, trySelectAssets } = require('../src/scenery-showcase-original14-roles');

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

test('missing purchased forest kit fails closed', () => {
  const missing = INVENTORY.filter((item) => !item.key.includes('Stylized_Forest_Nature_Kit.zip'));
  const result = trySelectAssets(missing);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ORIGINAL_14_SOURCE_MISSING');
  assert.equal(result.missingRole, 'forest_nature');
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const contract = require('../src/stagegraph-production-contract-v1');

const repoRoot = path.resolve(__dirname, '../../..');
const load = (name) => JSON.parse(fs.readFileSync(path.join(repoRoot, 'artifacts/tivvlejoy-stagegraph-v1', name), 'utf8'));

test('committed StageGraph receipts clear dependency audit and stop at vendor-reference approval', () => {
  const receipts = {
    SOURCE_PACK_LOCKED: load('SOURCE_PACK_LOCKED.json'),
    DEPENDENCY_AUDIT_PASS: load('DEPENDENCY_AUDIT_PASS.json'),
  };
  const sourceVerdict = contract.receiptVerdict('SOURCE_PACK_LOCKED', receipts.SOURCE_PACK_LOCKED);
  const dependencyVerdict = contract.receiptVerdict('DEPENDENCY_AUDIT_PASS', receipts.DEPENDENCY_AUDIT_PASS);
  assert.deepEqual(sourceVerdict, { valid: true, blockers: [] });
  assert.deepEqual(dependencyVerdict, { valid: true, blockers: [] });

  const graph = contract.evaluateStageGraph({
    selectedSourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    receipts,
  });
  assert.deepEqual(graph.completed, ['SOURCE_PACK_LOCKED', 'DEPENDENCY_AUDIT_PASS']);
  assert.equal(graph.nextStage, 'VENDOR_REFERENCE_REPRODUCED');
  assert.equal(graph.productionReady, false);
  assert.equal(graph.finalRenderAuthorized, false);
});

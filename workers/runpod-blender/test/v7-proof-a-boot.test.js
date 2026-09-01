const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const boot = path.resolve(__dirname, '../src/v7-proof-a-boot.js');

const syntax = spawnSync('node', ['--check', boot], { encoding: 'utf8' });
assert.equal(syntax.status, 0, syntax.stderr);

const exported = require(boot);
assert.equal(typeof exported.mark, 'function');
assert.equal(typeof exported.meminfo, 'function');
console.log('v7-proof-a-boot.test PASS');

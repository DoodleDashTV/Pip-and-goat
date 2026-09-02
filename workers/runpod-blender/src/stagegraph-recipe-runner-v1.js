#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  buildExecutionPlan,
  validateResultReceipt,
} = require('./stagegraph-recipe-contract-v1');

function usage() {
  process.stderr.write(
    'Usage:\n' +
    '  node stagegraph-recipe-runner-v1.js plan <recipe.json>\n' +
    '  node stagegraph-recipe-runner-v1.js verify-result <recipe.json> <result.json>\n'
  );
  process.exit(2);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function main(argv) {
  const [mode, recipePath, resultPath] = argv;
  if (!mode || !recipePath) usage();

  const recipe = readJson(recipePath);

  if (mode === 'plan') {
    const plan = buildExecutionPlan(recipe);
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  if (mode === 'verify-result') {
    if (!resultPath) usage();
    const result = readJson(resultPath);
    const verdict = validateResultReceipt(recipe, result);
    process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
    if (!verdict.valid) process.exitCode = 1;
    return;
  }

  usage();
}

if (require.main === module) main(process.argv.slice(2));

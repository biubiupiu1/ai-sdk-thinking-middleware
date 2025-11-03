#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const vitestModule = require('../tools/local-vitest');
const aiModule = require('../tools/local-ai');
const { runRegisteredTests, resetState } = require('../tools/local-vitest/runner');

const originalLoad = Module._load;
Module._load = function patchedLoader(request, parent, isMain) {
  if (request === 'vitest') {
    return vitestModule;
  }
  if (request === 'ai') {
    return aiModule;
  }
  return originalLoad.call(this, request, parent, isMain);
};

function findTestFiles(dir) {
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(resolved));
      continue;
    }
    if (/\.test\.(cjs|js)$/.test(entry.name)) {
      files.push(resolved);
    }
  }
  return files;
}

async function main() {
  const testDir = path.resolve(__dirname, '../test');
  const testFiles = findTestFiles(testDir);

  if (testFiles.length === 0) {
    console.warn('No test files found.');
    return;
  }

  resetState();

  for (const file of testFiles) {
    delete require.cache[file];
    require(file);
  }

  const result = await runRegisteredTests();
  Module._load = originalLoad;

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});

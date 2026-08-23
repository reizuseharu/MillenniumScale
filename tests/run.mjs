#!/usr/bin/env node
/** Runs every *.test.mjs in this folder and exits non-zero on any failure. */
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = (await readdir(here)).filter((f) => f.endsWith('.test.mjs')).sort();

let passed = 0, failed = 0;
for (const f of files) {
  const mod = await import(pathToFileURL(resolve(here, f)).href);
  const r = mod.default();
  passed += r.passed;
  failed += r.failed;
}

console.log(`\n${'-'.repeat(52)}`);
console.log(`${passed} passed, ${failed} failed, across ${files.length} suites`);
process.exit(failed ? 1 : 0);

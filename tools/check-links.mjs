#!/usr/bin/env node
/**
 * Verify that every local href/src in the built site actually exists.
 *
 * This is the check that would have caught the assets/ folder being
 * flattened, and the favicon whose data URI was truncated by an
 * unescaped quote. It runs in CI before anything is published.
 *
 *   node tools/check-links.mjs _site
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, dirname, normalize } from 'node:path';

const root = resolve(process.argv[2] || '_site');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

const files = await walk(root);
const pages = files.filter((f) => f.endsWith('.html'));

let problems = 0;
let checked = 0;

for (const page of pages) {
  const html = await readFile(page, 'utf8');
  const refs = [
    ...html.matchAll(/<(?:link|script|img|a)\b[^>]*?\b(?:href|src)="([^"]+)"/g)
  ].map((m) => m[1]);

  for (const ref of refs) {
    if (/^(https?:|data:|mailto:|#|\/\/)/.test(ref)) continue;
    const clean = ref.split(/[?#]/)[0];
    if (!clean) continue;

    const target = clean.startsWith('/')
      ? join(root, clean)
      : normalize(join(dirname(page), clean));

    checked++;
    if (!(await exists(target))) {
      console.error(`  MISSING  ${page.slice(root.length + 1)}  ->  ${ref}`);
      problems++;
    }
  }

  // A stylesheet that fails to load takes the whole page down, so be explicit.
  if (!/href="[^"]*styles\.css"/.test(html)) {
    console.error(`  MISSING  ${page.slice(root.length + 1)}  ->  no stylesheet linked`);
    problems++;
  }
}

// Assets referenced from CSS (url(...)) must resolve too.
for (const css of files.filter((f) => f.endsWith('.css'))) {
  const text = await readFile(css, 'utf8');
  for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    const ref = m[1];
    if (/^(https?:|data:|\/\/)/.test(ref)) continue;
    const target = ref.startsWith('/') ? join(root, ref) : normalize(join(dirname(css), ref));
    checked++;
    if (!(await exists(target))) {
      console.error(`  MISSING  ${css.slice(root.length + 1)}  ->  ${ref}`);
      problems++;
    }
  }
}

// The data bundle has to be present and populated, or every deck reads legal.
const bundle = join(root, 'data/banlists.js');
if (!(await exists(bundle))) {
  console.error('  MISSING  data/banlists.js');
  problems++;
} else {
  const text = await readFile(bundle, 'utf8');
  const m = text.match(/"lists":\s*\[/g);
  if (!m || !m.length) {
    console.error('  EMPTY    data/banlists.js contains no lists — run tools/fetch-banlists.mjs');
    problems++;
  }
}

if (problems) {
  console.error(`\n${problems} problem(s) across ${pages.length} pages.`);
  process.exit(1);
}
console.log(`check-links: ${checked} local references across ${pages.length} pages, all resolve.`);

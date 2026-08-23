/**
 * A minimal DOM + storage stub, enough to load js/core.js in Node and
 * exercise the parsers, validation engine, diff and rendering helpers
 * without a browser.
 */
import fs from 'node:fs';
import vm from 'node:vm';

export function makeElement(tag, registry) {
  const n = {
    tag, attrs: {}, children: [], classes: new Set(), listeners: {},
    textContent: '', innerHTML: '', removed: false, open: false,
    setAttribute(k, v) {
      this.attrs[k] = v;
      if (k === 'class') this.className = v;
    },
    getAttribute(k) { return this.attrs[k] ?? null; },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.unshift(c); return c; },
    remove() { this.removed = true; },
    addEventListener(k, f) { (this.listeners[k] = this.listeners[k] || []).push(f); },
    fire(k, ev) { (this.listeners[k] || []).forEach((f) => f(ev || {})); },
    close() { this.open = false; },
    showModal() { this.open = true; },
    style: { setProperty() {} },
    classList: {
      add: (c) => n.classes.add(c),
      remove: (c) => n.classes.delete(c),
      contains: (c) => n.classes.has(c),
      toggle: (c, on) => (on ? n.classes.add(c) : n.classes.delete(c))
    }
  };
  // MS.el assigns .className directly rather than via setAttribute.
  let cn = '';
  Object.defineProperty(n, 'className', {
    get() { return cn; },
    set(v) { cn = v; n.classes.clear(); String(v).split(' ').filter(Boolean).forEach((c) => n.classes.add(c)); }
  });
  Object.defineProperty(n, 'firstChild', { get() { return n.children[0]; } });
  if (registry) registry.push(n);
  return n;
}

/** Depth-first search for every node carrying a class. */
export function findAll(root, cls) {
  const out = [];
  (function walk(n) {
    if (!n) return;
    if (n.classes && n.classes.has(cls)) out.push(n);
    (n.children || []).forEach(walk);
  })(root);
  return out;
}

/**
 * Load the app into a fresh sandbox.
 * @param {object} opts
 * @param {string[]} opts.files  scripts to run, relative to the repo root
 * @param {object[]} opts.cards  optional card records to preload
 */
export function load(opts = {}) {
  const files = opts.files || ['data/banlists.js', 'data/idmap.js', 'js/core.js'];
  const created = [];
  const store = {};

  const document = {
    readyState: 'complete',
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (t) => makeElement(t, created),
    createElementNS: (ns, t) => makeElement(t, created),
    addEventListener() {},
    documentElement: {
      _theme: 'light',
      getAttribute() { return this._theme; },
      setAttribute(k, v) { if (k === 'data-theme') this._theme = v; }
    },
    body: { appendChild() {}, insertBefore() {}, style: {} }
  };

  const ctx = {
    document, console,
    location: { pathname: '/index.html', search: '', href: '' },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    indexedDB: null,
    setTimeout, clearTimeout,
    fetch: opts.fetch || (() => Promise.reject(new TypeError('offline'))),
    Promise, Array, Object, JSON, Number, Math, Date, String, Boolean,
    isNaN, parseInt, parseFloat, Error, TypeError,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    Uint8Array, Uint32Array, Blob: class {}, URL,
    addEventListener() {}, matchMedia: () => ({ matches: false }),
    innerWidth: 1400, innerHeight: 900,
    URLSearchParams
  };
  ctx.window = ctx;
  ctx.global = ctx;
  if (opts.cards) ctx.MS_CARDS = { cards: opts.cards };

  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);

  return { MS: ctx.MS, ctx, created, store, findAll };
}

/* ---------- tiny assertion helpers ---------- */

export function suite(name) {
  const results = { name, passed: 0, failed: 0, lines: [] };
  return {
    results,
    test(label, fn) {
      try { fn(); results.passed++; results.lines.push(`  ok    ${label}`); }
      catch (e) { results.failed++; results.lines.push(`  FAIL  ${label}\n          ${e.message}`); }
    },
    note(text) { results.lines.push(`        ${text}`); },
    report() {
      console.log(`\n${name}`);
      results.lines.forEach((l) => console.log(l));
      return results;
    }
  };
}

export function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg || ''}got ${A}, expected ${B}`);
}

export function truthy(v, msg) {
  if (!v) throw new Error(msg || 'expected a truthy value');
}

export function throws(fn, re, msg) {
  try { fn(); } catch (e) { if (!re || re.test(e.message)) return; throw new Error(`${msg || ''}wrong error: ${e.message}`); }
  throw new Error(msg || 'expected it to throw');
}

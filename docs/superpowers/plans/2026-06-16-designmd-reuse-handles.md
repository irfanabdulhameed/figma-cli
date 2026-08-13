# DESIGN.md Reuse Handles (A+C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an extracted DESIGN.md carry a per-component reuse handle (library key + node id of the default variant), surface it in `spec`, and add an `instantiate <name>` command so an agent reuses an existing component instead of re-creating it.

**Architecture:** All logic lives in pure functions (handle string build/parse, instancing planner) so it is unit-testable with zero Figma. The walker gains two captured fields; the markdown writer gains one emitted line; the spec parser gains one parsed field; a thin new command file resolves the handle through an async, dynamic-page-safe eval. `locateDesignMd` moves to a shared lib so `spec` and `instantiate` share it.

**Tech Stack:** Node.js ESM, Commander, chalk, Node's built-in test runner (`node --test tests/*.test.js`), Figma Plugin API (via `fastEval`).

---

## File Structure

- **Modify** `src/design-extract.js` — walker captures `key`/`id` on COMPONENT_SET; `buildCensus` carries them; new pure `reuseHandleLine()`; components section emits the line.
- **Modify** `src/lib/design-spec.js` — new pure `parseReuseLine()` and `formatReuseDigest()`; `parseComponentSpecs` adds `spec.reuse`.
- **Create** `src/lib/design-md-locate.js` — `locateDesignMd()` moved out of `spec.js` so it can be shared.
- **Create** `src/lib/instance-plan.js` — pure `resolveInstancePlan()`.
- **Modify** `src/commands/spec.js` — import shared `locateDesignMd`; print reuse digest.
- **Create** `src/commands/instantiate.js` — the new command.
- **Modify** `src/index.js` — register the command.
- **Modify** `tests/design-extract.test.js`, `tests/design-spec.test.js` — new unit tests.
- **Create** `tests/instance-plan.test.js`, `tests/design-md-locate.test.js`, `tests/instantiate-roundtrip.test.js`.
- **Modify** `CLAUDE.md` — Quick Reference row + intent mapping.

---

## Task 1: Walker captures the reuse handle

**Files:**
- Modify: `src/design-extract.js` (walker `COMPONENT_SET` branch + `buildCensus` push)
- Test: `tests/design-extract.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/design-extract.test.js` (after the existing `walkerCode` tests near the top):

```js
test('walkerCode captures the default-variant reuse handle on a COMPONENT_SET', () => {
  const code = walkerCode('1:1');
  assert.match(code, /defaultVariant/);
  assert.match(code, /o\.id = dv\.id/);
  assert.match(code, /o\.key = dv\.key/);
});
```

Add near the `buildCensus` tests (after the `import { buildCensus, ... }` line):

```js
test('buildCensus carries key/id from a COMPONENT_SET walker node', () => {
  const pages = [{ id: '1:1', name: 'P', nodeCount: 1, frames: [
    { t: 'COMPONENT_SET', n: 'Button', vp: { Size: { values: ['S', 'M'] } },
      kidCount: 2, key: 'abc123', id: '10:5', kids: [{ t: 'COMPONENT', n: 'Size=S' }] },
  ] }];
  const census = buildCensus(pages);
  assert.equal(census.componentSets.length, 1);
  assert.equal(census.componentSets[0].key, 'abc123');
  assert.equal(census.componentSets[0].id, '10:5');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/design-extract.test.js`
Expected: FAIL — `defaultVariant` not in walker code; `census.componentSets[0].key` is `undefined`.

- [ ] **Step 3: Implement**

In `src/design-extract.js`, the walker `COMPONENT_SET` branch currently reads:

```js
      if (n.type === 'COMPONENT_SET') {
        try { o.vp = n.variantGroupProperties; } catch (e) {}
        o.kidCount = n.children.length;
        if (n.children.length) o.kids = [walk(n.children[0], depth + 1)];
        return o;
      }
```

Replace with:

```js
      if (n.type === 'COMPONENT_SET') {
        try { o.vp = n.variantGroupProperties; } catch (e) {}
        o.kidCount = n.children.length;
        // Reuse handle: the default variant is the COMPONENT you instance
        // (a set has no createInstance). Capture its node id (same-file reuse)
        // and publish key (cross-file reuse, only resolvable once published).
        const dv = n.defaultVariant || n.children[0];
        if (dv) { o.id = dv.id; try { o.key = dv.key; } catch (e) {} }
        if (n.children.length) o.kids = [walk(n.children[0], depth + 1)];
        return o;
      }
```

In `buildCensus`, the push currently reads:

```js
      census.componentSets.push({ name: n.n, page: pageName, props: n.vp || {}, variants: n.kidCount || 0, sample: n.kids?.[0] });
```

Replace with:

```js
      census.componentSets.push({ name: n.n, page: pageName, props: n.vp || {}, variants: n.kidCount || 0, sample: n.kids?.[0], key: n.key, id: n.id });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/design-extract.test.js`
Expected: PASS (all tests, including the new two).

- [ ] **Step 5: Commit**

```bash
git add src/design-extract.js tests/design-extract.test.js
git commit -m "feat(extract): capture reuse handle (default-variant key+id) on component sets"
```

---

## Task 2: `reuseHandleLine` + emit in the components section

**Files:**
- Modify: `src/design-extract.js` (new exported fn + components section emit)
- Test: `tests/design-extract.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/design-extract.test.js`:

```js
import { reuseHandleLine } from '../src/design-extract.js';

test('reuseHandleLine: key + id', () => {
  assert.equal(reuseHandleLine({ key: 'abc', id: '1:2' }),
    'Reuse: import existing — key `abc` · node `1:2`');
});
test('reuseHandleLine: id only', () => {
  assert.equal(reuseHandleLine({ id: '1:2' }), 'Reuse: import existing — node `1:2`');
});
test('reuseHandleLine: neither → null', () => {
  assert.equal(reuseHandleLine({}), null);
  assert.equal(reuseHandleLine(), null);
});

test('generateDesignMd components section emits the Reuse line', () => {
  const pages = [{ id: '1:1', name: 'P', nodeCount: 1, frames: [
    { t: 'COMPONENT_SET', n: 'Button', vp: { Size: { values: ['S', 'M'] } },
      kidCount: 2, key: 'abc123', id: '10:5', kids: [{ t: 'COMPONENT', n: 'Size=S' }] },
  ] }];
  const md = generateDesignMd({ fileName: 'F', date: '2026-06-16', pages }, { sections: ['components'] });
  assert.match(md, /Reuse: import existing — key `abc123` · node `10:5`/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/design-extract.test.js`
Expected: FAIL — `reuseHandleLine` is not exported; md lacks the Reuse line.

- [ ] **Step 3: Implement**

In `src/design-extract.js`, add this exported function next to `variantMatrixTable` (just above the `// ============ Markdown writer ============` banner):

```js
/**
 * Reuse handle markdown line for a component census entry. Pure.
 * Returns the line, or null when there is no handle to emit.
 */
export function reuseHandleLine({ key, id } = {}) {
  const parts = [];
  if (key) parts.push(`key \`${key}\``);
  if (id) parts.push(`node \`${id}\``);
  if (!parts.length) return null;
  return `Reuse: import existing — ${parts.join(' · ')}`;
}
```

In the components section, the current emit reads:

```js
        out.push(`Page: ${cs.page} · ${cs.variants} variants`, '');
        out.push(variantMatrixTable(cs.props), '');
```

Replace with:

```js
        out.push(`Page: ${cs.page} · ${cs.variants} variants`, '');
        const reuse = reuseHandleLine({ key: cs.key, id: cs.id });
        if (reuse) out.push(reuse, '');
        out.push(variantMatrixTable(cs.props), '');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/design-extract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/design-extract.js tests/design-extract.test.js
git commit -m "feat(extract): emit Reuse handle line in DESIGN.md components section"
```

---

## Task 3: Parse the Reuse line into `spec.reuse`

**Files:**
- Modify: `src/lib/design-spec.js` (new exported `parseReuseLine`; `parseComponentSpecs` sets `reuse`)
- Test: `tests/design-spec.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/design-spec.test.js`:

```js
import { parseReuseLine, parseComponentSpecs } from '../src/lib/design-spec.js';
import { reuseHandleLine } from '../src/design-extract.js';

test('parseReuseLine round-trips with reuseHandleLine', () => {
  const line = reuseHandleLine({ key: 'abc123', id: '10:5' });
  assert.deepEqual(parseReuseLine(line), { key: 'abc123', id: '10:5' });
});
test('parseReuseLine: id only', () => {
  assert.deepEqual(parseReuseLine(reuseHandleLine({ id: '10:5' })), { key: null, id: '10:5' });
});
test('parseReuseLine: no line → null', () => {
  assert.equal(parseReuseLine('no handle here'), null);
});

test('parseComponentSpecs picks up reuse handle', () => {
  const md = [
    '### Button',
    'Page: P · 2 variants',
    'Reuse: import existing — key `abc123` · node `10:5`',
    '',
    '| Property | Values |',
    '|---|---|',
    '| Size | S, M |',
    '',
  ].join('\n');
  const specs = parseComponentSpecs(md);
  assert.equal(specs.length, 1);
  assert.deepEqual(specs[0].reuse, { key: 'abc123', id: '10:5' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/design-spec.test.js`
Expected: FAIL — `parseReuseLine` not exported; `specs[0].reuse` is `undefined`.

- [ ] **Step 3: Implement**

In `src/lib/design-spec.js`, add this exported function above `parseComponentSpecs`:

```js
/**
 * Parse a "Reuse: import existing — key `x` · node `y`" line out of a block. Pure.
 * Returns { key, id } (either may be null) or null when there is no line.
 */
export function parseReuseLine(text) {
  const m = /^Reuse:.*$/m.exec(text || '');
  if (!m) return null;
  const key = (/key\s+`([^`]+)`/.exec(m[0]) || [])[1] || null;
  const id = (/node\s+`([^`]+)`/.exec(m[0]) || [])[1] || null;
  if (!key && !id) return null;
  return { key, id };
}
```

In `parseComponentSpecs`, the `specs.push(...)` currently reads:

```js
    specs.push({ name: b.name, page: pageM ? pageM[1].trim() : null, variants: Number(vm[1]), axes, sample });
```

Replace with:

```js
    specs.push({ name: b.name, page: pageM ? pageM[1].trim() : null, variants: Number(vm[1]), axes, sample, reuse: parseReuseLine(body) });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/design-spec.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design-spec.js tests/design-spec.test.js
git commit -m "feat(spec): parse the DESIGN.md Reuse handle into spec.reuse"
```

---

## Task 4: `formatReuseDigest` + show it in `spec`

**Files:**
- Modify: `src/lib/design-spec.js` (new exported `formatReuseDigest`)
- Modify: `src/commands/spec.js` (print the digest)
- Test: `tests/design-spec.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/design-spec.test.js`:

```js
import { formatReuseDigest } from '../src/lib/design-spec.js';

test('formatReuseDigest renders the instantiate hint + truncated key', () => {
  const lines = formatReuseDigest({ name: 'Button', reuse: { key: '0a1b2c3d4e5f', id: '10:5' } });
  const joined = lines.join('\n');
  assert.match(joined, /figma-cli instantiate "Button"/);
  assert.match(joined, /key 0a1b2c3d…/);
  assert.match(joined, /node 10:5 \(same-file\)/);
});
test('formatReuseDigest: no reuse → empty', () => {
  assert.deepEqual(formatReuseDigest({ name: 'X' }), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/design-spec.test.js`
Expected: FAIL — `formatReuseDigest` not exported.

- [ ] **Step 3: Implement**

In `src/lib/design-spec.js`, add:

```js
/**
 * Compact reuse hint for the `spec` digest. Pure. Returns string[] (lines) or [].
 * Shown as the recommended path BEFORE the axes — instance, don't rebuild.
 */
export function formatReuseDigest(spec) {
  if (!spec || !spec.reuse) return [];
  const { key, id } = spec.reuse;
  const refs = [
    key ? `key ${key.slice(0, 8)}…` : null,
    id ? `node ${id} (same-file)` : null,
  ].filter(Boolean).join('  ·  ');
  return [
    `reuse: figma-cli instantiate "${spec.name}"   ← use the existing component, don't rebuild`,
    `  ${refs}`,
  ];
}
```

In `src/commands/spec.js`, add `formatReuseDigest` to the import from `../lib/design-spec.js`:

```js
import { findComponentSpec, checkConformance, formatReuseDigest } from '../lib/design-spec.js';
```

In the digest branch (the `if (!options.check)` block), immediately after the
`console.log(chalk.bold(spec.name) + ...)` line and before the axes block, insert:

```js
      const reuseLines = formatReuseDigest(spec);
      if (reuseLines.length) console.log(chalk.gray(reuseLines.join('\n')));
```

(The JSON line `spec` already emits now includes `reuse`, since it lives on the spec object — no change needed there.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/design-spec.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design-spec.js src/commands/spec.js tests/design-spec.test.js
git commit -m "feat(spec): show reuse handle as the recommended path in the digest"
```

---

## Task 5: Extract `locateDesignMd` to a shared lib

**Files:**
- Create: `src/lib/design-md-locate.js`
- Modify: `src/commands/spec.js` (import instead of local def)
- Test: `tests/design-md-locate.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/design-md-locate.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { locateDesignMd } from '../src/lib/design-md-locate.js';

test('locateDesignMd returns an explicit path when it exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dml-'));
  const f = join(dir, 'DESIGN.md');
  writeFileSync(f, '# x');
  assert.equal(locateDesignMd(f), f);
});

test('locateDesignMd prefers a file containing a Components section', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dml-'));
  writeFileSync(join(dir, 'other.md'), '# nothing here');
  const good = join(dir, 'DESIGN.md');
  writeFileSync(good, 'Sample variant structure:\n- **X** · `FRAME`');
  const cwd = process.cwd();
  process.chdir(dir);
  try { assert.equal(locateDesignMd(), good); } finally { process.chdir(cwd); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/design-md-locate.test.js`
Expected: FAIL — module `src/lib/design-md-locate.js` does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/design-md-locate.js` by moving the function out of `spec.js` verbatim:

```js
// Locate a DESIGN.md (any name) in cwd or one level of subdirs. CLI-side file
// reads only — no model tokens spent scanning. Shared by `spec` and `instantiate`.
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const MARKER = 'Sample variant structure:';   // a DESIGN.md with a Components section

export function locateDesignMd(explicit) {
  if (explicit) return existsSync(explicit) ? explicit : null;
  const cwd = process.cwd();
  const candidates = [];
  const scanDir = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (e.startsWith('.') || e === 'node_modules') continue;
      const p = join(dir, e);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isFile() && e.endsWith('.md')) candidates.push(p);
      else if (st.isDirectory() && depth > 0) scanDir(p, depth - 1);
    }
  };
  scanDir(cwd, 1);
  for (const f of candidates) {
    try { if (readFileSync(f, 'utf8').includes(MARKER)) return f; } catch {}
  }
  return null;
}
```

In `src/commands/spec.js`: delete the local `MARKER` const and the local
`locateDesignMd` function (lines defining them), and add to the imports:

```js
import { locateDesignMd } from '../lib/design-md-locate.js';
```

Keep the remaining `fs` imports in `spec.js` only if still used (it still uses
`readFileSync`); leave `readdirSync`/`statSync`/`existsSync` only if referenced
elsewhere — remove now-unused names from the `fs` import to keep it clean.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/design-md-locate.test.js && node --test tests/design-spec.test.js`
Expected: PASS. Then smoke-test the command still wires up:
Run: `node src/index.js spec --help`
Expected: prints the spec command help with no import error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design-md-locate.js src/commands/spec.js tests/design-md-locate.test.js
git commit -m "refactor(spec): move locateDesignMd to a shared lib for instantiate to reuse"
```

---

## Task 6: `resolveInstancePlan` pure planner

**Files:**
- Create: `src/lib/instance-plan.js`
- Test: `tests/instance-plan.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/instance-plan.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInstancePlan } from '../src/lib/instance-plan.js';

test('key + id → key first (cross-file), id fallback (same-file)', () => {
  assert.deepEqual(resolveInstancePlan({ key: 'k', id: '1:2' }),
    [{ via: 'key', key: 'k' }, { via: 'id', id: '1:2' }]);
});
test('id only → id only', () => {
  assert.deepEqual(resolveInstancePlan({ id: '1:2' }), [{ via: 'id', id: '1:2' }]);
});
test('key only → key only', () => {
  assert.deepEqual(resolveInstancePlan({ key: 'k' }), [{ via: 'key', key: 'k' }]);
});
test('empty / null → empty plan', () => {
  assert.deepEqual(resolveInstancePlan(null), []);
  assert.deepEqual(resolveInstancePlan({}), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/instance-plan.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/instance-plan.js`:

```js
/**
 * Ordered instancing attempts from a reuse handle. Pure.
 * key first (cross-file / published library), id as the always-works same-file
 * fallback. The I/O shell tries each in order until one succeeds.
 */
export function resolveInstancePlan(reuse) {
  if (!reuse) return [];
  const plan = [];
  if (reuse.key) plan.push({ via: 'key', key: reuse.key });
  if (reuse.id) plan.push({ via: 'id', id: reuse.id });
  return plan;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/instance-plan.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instance-plan.js tests/instance-plan.test.js
git commit -m "feat(instantiate): pure resolveInstancePlan planner (key-then-id)"
```

---

## Task 7: The `instantiate` command

**Files:**
- Create: `src/commands/instantiate.js`
- Modify: `src/index.js` (register)
- Test: `tests/instantiate-cmd.test.js` (module loads + builds valid eval)

- [ ] **Step 1: Write the failing test**

Create `tests/instantiate-cmd.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instantiateCode } from '../src/commands/instantiate.js';

test('instantiateCode is syntactically valid JS for a key+id plan', () => {
  const code = instantiateCode([{ via: 'key', key: 'k' }, { via: 'id', id: '1:2' }]);
  assert.doesNotThrow(() => new Function(`return ${code}`));
  assert.match(code, /importComponentByKeyAsync/);
  assert.match(code, /getNodeByIdAsync/);
  assert.match(code, /createInstance/);
  // dynamic-page safe: no legacy sync getNodeById( in the generated code
  assert.doesNotMatch(code, /[^A-Za-z]getNodeById\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/instantiate-cmd.test.js`
Expected: FAIL — module/`instantiateCode` does not exist.

- [ ] **Step 3: Implement**

Create `src/commands/instantiate.js`:

```js
// Command: instantiate — drop an instance of an EXISTING component using the
// reuse handle captured in an extracted DESIGN.md, instead of rebuilding it.
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { program, checkConnection, fastEval } from '../lib/cli-core.js';
import { findComponentSpec } from '../lib/design-spec.js';
import { locateDesignMd } from '../lib/design-md-locate.js';
import { resolveInstancePlan } from '../lib/instance-plan.js';

// Build the async, dynamic-page-safe eval that tries each plan step in order.
// Exported for unit testing. A COMPONENT_SET resolves to its default variant
// (a set has no createInstance). First success wins; failures are collected.
export function instantiateCode(plan) {
  return `(async () => {
    const plan = ${JSON.stringify(plan)};
    const tried = [];
    for (const step of plan) {
      try {
        let comp;
        if (step.via === 'key') comp = await figma.importComponentByKeyAsync(step.key);
        else comp = await figma.getNodeByIdAsync(step.id);
        if (!comp) { tried.push(step.via + ': not found'); continue; }
        if (comp.type === 'COMPONENT_SET') comp = comp.defaultVariant || comp.children[0];
        if (!comp || comp.type !== 'COMPONENT') { tried.push(step.via + ': not a component'); continue; }
        const inst = comp.createInstance();
        const c = figma.viewport.center;
        inst.x = Math.round(c.x); inst.y = Math.round(c.y);
        figma.currentPage.appendChild(inst);
        figma.currentPage.selection = [inst];
        figma.viewport.scrollAndZoomIntoView([inst]);
        return JSON.stringify({ ok: true, via: step.via, id: inst.id, name: inst.name });
      } catch (e) { tried.push(step.via + ': ' + e.message); }
    }
    return JSON.stringify({ ok: false, tried });
  })()`;
}

program
  .command('instantiate <name>')
  .description('Drop an instance of an EXISTING component (reuse handle from DESIGN.md) instead of rebuilding it')
  .option('-f, --file <path>', 'DESIGN.md to read (default: auto-locate in cwd / subdirs)')
  .action(async (name, options) => {
    const file = locateDesignMd(options.file);
    if (!file) {
      console.error(chalk.red('✗ No DESIGN.md found.'), 'Run `figma-cli extract` first or pass --file.');
      process.exit(1);
    }
    const md = readFileSync(file, 'utf8');
    const spec = findComponentSpec(md, name);
    if (!spec) {
      console.error(chalk.red(`✗ No component matching "${name}" in ${file}.`));
      process.exit(1);
    }
    if (!spec.reuse) {
      console.error(chalk.red(`✗ No reuse handle for "${spec.name}".`), 'Re-run `figma-cli extract` to capture it.');
      process.exit(1);
    }
    const plan = resolveInstancePlan(spec.reuse);
    await checkConnection();
    let res = await fastEval(instantiateCode(plan));
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch {} }
    if (!res || !res.ok) {
      console.error(chalk.red(`✗ Could not instantiate "${spec.name}".`),
        res?.tried ? chalk.gray('Tried — ' + res.tried.join('; ')) : '');
      process.exit(1);
    }
    console.log(chalk.green(`✓ Instanced "${spec.name}" via ${res.via} → ${res.id}`));
    process.exit(0);
  });
```

In `src/index.js`, after the line `import './commands/spec.js';`, add:

```js
import './commands/instantiate.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/instantiate-cmd.test.js`
Expected: PASS.
Run: `node src/index.js instantiate --help`
Expected: prints the instantiate command help with no import error.

- [ ] **Step 5: Commit**

```bash
git add src/commands/instantiate.js src/index.js tests/instantiate-cmd.test.js
git commit -m "feat(instantiate): add the instantiate <name> command (key→id reuse)"
```

---

## Task 8: Live roundtrip integration test (daemon-gated)

**Files:**
- Create: `tests/instantiate-roundtrip.test.js`

This proves the same-file `id` path end-to-end on a free account, and that the
`key` branch runs then falls back to `id`. It SKIPS cleanly when Figma is not
connected, so `npm test` stays green in CI.

- [ ] **Step 1: Write the gated test**

Create `tests/instantiate-roundtrip.test.js`. The test is fully self-contained:
it builds its own `Button` COMPONENT_SET in the connected file via one `eval`,
runs the real roundtrip, then deletes everything it created (it must not leave
artifacts in the user's open file).

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(process.cwd(), 'src', 'index.js');
function run(args, opts = {}) {
  return execFileSync('node', [CLI, ...args], { encoding: 'utf8', ...opts });
}
function daemonUp() {
  try { return /running/i.test(run(['daemon', 'status'])); } catch { return false; }
}

// eval source that creates a 2-variant "Button" COMPONENT_SET and returns its id.
const BUILD_SET = `(async () => {
  const mk = (name) => { const c = figma.createComponent(); c.name = name; c.resize(80, 40); return c; };
  const a = mk('Size=Small'); const b = mk('Size=Large');
  const set = figma.combineAsVariants([a, b], figma.currentPage);
  set.name = 'Button';
  return JSON.stringify({ id: set.id });
})()`;

const cleanup = (id) => `(async () => {
  const n = await figma.getNodeByIdAsync(${'${JSON.stringify(id)}'});
  if (n) n.remove();
  return 'ok';
})()`;

test('extract → instantiate roundtrip (gated on a connected Figma)', { skip: !daemonUp() }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'inst-'));
  const md = join(dir, 'DESIGN.md');
  let setId;
  try {
    const built = JSON.parse(run(['eval', BUILD_SET]).trim().split('\n').pop());
    setId = built.id;

    run(['extract', md]);
    const text = readFileSync(md, 'utf8');
    assert.match(text, /### Button/);
    assert.match(text, /Reuse: import existing/);

    const out = run(['instantiate', 'Button', '--file', md]);
    assert.match(out, /Instanced "Button" via (key|id)/);
  } finally {
    // Delete the created set (and the instance, selected by `instantiate`).
    if (setId) { try { run(['eval', cleanup(setId)]); } catch {} }
    try { run(['eval', `(async () => { const s = figma.currentPage.selection; s.forEach(n => n.remove()); return 'ok'; })()`]); } catch {}
  }
});
```

Note: `${...}` inside `cleanup` is shown escaped above so the markdown does not
interpolate it — in the real file write `${JSON.stringify(id)}` as normal JS.

- [ ] **Step 2: Run the test**

Run: `node --test tests/instantiate-roundtrip.test.js`
Expected: when the daemon is DOWN → the test reports `skipped`, exit 0.
When connected → it builds the set, asserts the Reuse line and a successful
instance, then removes its own nodes. PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/instantiate-roundtrip.test.js
git commit -m "test(instantiate): daemon-gated extract→instantiate roundtrip"
```

---

## Task 9: Docs — Quick Reference + intent mapping

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the Quick Reference row**

In `CLAUDE.md`, in the Quick Reference table near the top, add a row under the
"convert to component" line:

```markdown
| "use the existing X component" / "don't rebuild, instance it" | `figma-cli instantiate "X"` |
| "what component already exists for X" | `figma-cli spec X` (shows the reuse handle) |
```

- [ ] **Step 2: Add an intent note near the THEMED vs SHADCN / multi-item section**

Add a short subsection after the "MULTI-ITEM CREATION" block:

```markdown
### ♻️ REUSE BEFORE REBUILD (extracted systems)

When a DESIGN.md was produced by `figma-cli extract`, every component carries a
**reuse handle**. If the user asks to "use" / "add" / "drop in" a component that
already exists in that system, do NOT re-render it — instance it:

- `figma-cli spec "Button"` shows the handle and prints the exact command.
- `figma-cli instantiate "Button"` drops a real instance (same-file via node id,
  cross-file via library key). This keeps the design consistent with the source
  system instead of producing a divergent hand-built copy.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: instantiate / reuse-before-rebuild intent mapping"
```

---

## Final verification

- [ ] **Run the whole suite**

Run: `npm test`
Expected: all tests pass; the roundtrip test reports `skipped` unless Figma is connected.

- [ ] **Manual roundtrip (once, on the free account)**

1. `figma-cli connect`
2. Build a `Button` COMPONENT_SET (`render-batch` the two variant frames, then
   `figma-cli variants from <ids> --property Size --values Small,Large --name Button`).
3. `figma-cli extract /tmp/DESIGN.md` → open it, confirm the `Reuse:` line on `### Button`.
4. `figma-cli spec Button --file /tmp/DESIGN.md` → confirm the `instantiate "Button"` hint.
5. `figma-cli instantiate Button --file /tmp/DESIGN.md` → confirm a real INSTANCE
   appears, selected and zoomed to, whose main component is the Button set.

**Definition of done:** all pure tests green, `npm test` passes, the manual
roundtrip verified once, and only the example-free source/tests committed.

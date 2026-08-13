# DESIGN.md Reuse Handles (A + C)

**Date:** 2026-06-16
**Status:** Approved for planning
**Scope:** A (reuse handle in DESIGN.md + `spec`) + C (`instantiate` command). B (drift-audit) is explicitly deferred.

## Problem

A portable `DESIGN.md` is a spec for *reimplementing* a component, not a pointer to
*reuse* an existing one. When an agent is driven by such a file it tends to re-create
components that already exist in the design system. That has three costs:

- **Token cost** , the agent regenerates structure it could have imported.
- **Run-to-run variance** , each run re-derives the component instead of resolving a
  stable reference.
- **Drift** , a hand-rebuilt copy diverges from the canonical component, hurting
  maintainability and consistency.

figma-cli already mitigates the first two structurally: `extract` auto-splits, `spec`
reads the md in code at zero LLM tokens, `spec --check` pins the output. The third is an
open gap: the extracted DESIGN.md carries **no handle** that tells an agent which
component already exists or how to instance it. This spec closes that gap.

## Goal

An extracted DESIGN.md carries, per component, a stable reuse handle (library `key` +
node `id`). `spec` surfaces it as the recommended path *before* a rebuild. A new
`instantiate <name>` command resolves the handle and drops a real instance on the
canvas , deterministically, with no JSX. The result: an agent driven by our DESIGN.md
*uses* the design system instead of cloning it.

## Non-goals (deferred)

- **B , drift audit:** flagging hand-built copies of library components in a file.
  This belongs on the *screen/usage* path, not the *authoring* path that `spec --check`
  verifies, so it is its own spec.
- Enriching instance references inside sample-variant trees with their own keys.
- Publishing libraries / any workflow that requires an org plan.

## Design

### Unit 1 , Walker capture (`src/design-extract.js`, `walkerCode`)

For `COMPONENT_SET` and standalone `COMPONENT` nodes, the walker additionally emits:

- `o.key = n.key` , the publish key. Present on every component regardless of plan
  (it is only *resolvable cross-file* once published, but capturing it is free).
- `o.id = n.id` , the node id, always present, the same-file reuse handle.

These flow through `buildCensus` into each `census.componentSets[i]` as `{ key, id }`.
No other walker behaviour changes.

### Unit 2 , DESIGN.md emission (`src/design-extract.js`, components section + a pure helper)

A new **pure function** `reuseHandleLine({ key, id })` returns the markdown line, so it
is unit-testable in isolation:

```
Reuse: import existing — key `0a1b2c3d…` · node `1:23`
```

Rules:
- Emit only when at least one of `key`/`id` is present.
- If `key` missing (rare), emit just `node \`1:23\``.
- Placed immediately after the `Page: … · N variants` line in each `### <Component>` block.

### Unit 3 , Spec parse + digest (`src/lib/design-spec.js`, `src/commands/spec.js`)

- `parseComponentSpecs` additionally parses the `Reuse:` line into
  `spec.reuse = { key, id }` (both optional). A new **pure function**
  `parseReuseLine(text)` does the extraction and round-trips with `reuseHandleLine`.
- `spec <name>` digest prints, above the axes, when `spec.reuse` exists:

```
reuse: figma-cli instantiate "Button"   ← use the existing component, don't rebuild
  key 0a1b2c3d…  ·  node 1:23 (same-file)
```

- The JSON line `spec` already emits gains the `reuse` field for programmatic use.
- `spec --check` is **unchanged** (authoring path; clone-detection is B's job).

### Unit 4 , `instantiate` command (new file `src/commands/instantiate.js`, one purpose per file)

`figma-cli instantiate <name>`:

1. Locate DESIGN.md via the existing `locateDesignMd` + `findComponentSpec` path
   (shared with `spec`).
2. Read `spec.reuse`. If absent → clear error: "no reuse handle for <name>; run
   `figma-cli extract` first."
3. Resolve via a **pure planner** `resolveInstancePlan(reuse)` → ordered attempts:
   `[{via:'key', key}, {via:'id', id}]` (key first for the cross-file case, id as the
   always-works fallback). Pure → unit-testable without Figma.
4. Thin I/O shell evals the plan in order: `importComponentByKeyAsync(key)` then
   `getNodeByIdAsync(id)` , both already exist in `figma-client.js`
   (`:2916`, `:2663`) , calling `.createInstance()` and applying smart positioning.
   First success wins; if all fail, a clear error naming what was tried.

Flags: `--file <path>` (explicit DESIGN.md), reuse of the standard positioning helper.

## Testing strategy , everything must be tested

The project uses Node's built-in runner (`node --test tests/*.test.js`), no framework.
The design pushes logic into pure functions so the bulk is covered with zero Figma.

**Pure-function unit tests (no Figma, deterministic):**

1. `reuseHandleLine` , key+id, id-only, neither (→ no line). (`design-extract.test.js`)
2. `extract` components section includes the Reuse line for a fixture census with a
   component that has `{key,id}`. (`design-extract.test.js`)
3. `parseReuseLine` / `parseComponentSpecs` , round-trip: feed the exact string
   `reuseHandleLine` produces, assert `{key,id}` come back. (`design-spec.test.js`)
4. `resolveInstancePlan` , key+id → key-then-id order; id-only → id only; empty →
   empty plan. (new `instantiate.test.js`)
5. `spec` digest , given a spec with `reuse`, the rendered digest contains the
   `instantiate "<name>"` line and the truncated key. (`design-spec.test.js`)

**Daemon-backed integration test (free account, same-file `id` path):**

6. Full roundtrip on a real Figma file: build a Button component set → `extract` →
   assert DESIGN.md has the Reuse line → `instantiate "Button"` → assert a real
   `INSTANCE` whose `mainComponent` is the Button set. Gated to run only when the
   daemon is connected (skip with a logged notice otherwise, like other live checks).

**Cross-file `key` path , verified without a published library:**

7. The `key` is a captured string → asserted by test 2 (string match), not by live
   resolution.
8. The key→id fallback is exercised by test 6: same-file, `importComponentByKeyAsync`
   on a local key fails, the planner falls back to `id`, the instance still appears →
   proves the key branch runs and its error handling is correct.
9. True cross-file resolution is guaranteed by Figma's documented API contract in a
   file where the library is enabled; we do not gate shipping on it.

**Definition of done:** all pure tests green, the integration test green when connected,
`npm test` passes, and a manual `extract`→`instantiate` roundtrip verified once by hand.

## Risks

- `n.key` access on some node types could throw in odd files → wrap in try/catch like
  the existing `o.vp` capture (`design-extract.js:71`).
- `instantiate` name match must reuse `findComponentSpec`'s exact→prefix→substring
  order so it behaves identically to `spec`.
- Smart positioning for a fresh instance must not overlap existing nodes , reuse the
  same helper `render`/`createInstance` already use.

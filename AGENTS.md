# Using figma-cli

figma-cli controls **Figma Desktop** directly (no API key). It runs in any
terminal. Open Figma Desktop, then `figma-cli connect` once per session.

## Connection rules (Yolo mode only — never interrupt the user's Figma)
1. **Always use Yolo mode** (direct CDP). Never use Safe mode and never ask the
   user to open the FigCli plugin. If the Yolo patch is blocked on macOS, tell the
   user to enable their terminal under System Settings → Privacy & Security →
   **App Management**, wait, then retry `figma-cli connect`. Do NOT fall back to
   Safe mode as a workaround.
2. **The patch is one-time and persistent.** If Figma was already patched (any
   previous successful connect), never patch, unpatch, quit, or relaunch Figma
   again. Only the very first patch ever requires a single Figma restart.
3. **Session start:** run `figma-cli daemon status`. If connected → do nothing
   else. If down → `figma-cli connect` (this attaches to the running, already-
   patched Figma; it must not relaunch it).
4. **Never restart or reload Figma to "fix" a failed command.** Retry through the
   daemon (`figma-cli daemon restart` restarts only the local daemon, not Figma).
   Never reload the Figma page/tab and never toggle plugins as part of a workflow.

## Running two agents at once

Two agents can share one Figma file if each stays on its own page. An open file
is a single Figma Desktop tab, so both agents share one plugin sandbox and
therefore one `figma.currentPage` — anything resolved through `currentPage` or
the selection reads whatever page the *other* agent last opened.

Pin each session to its page and the CLI enforces the rest:

```
# agent A                                  # agent B
DAEMON_PORT=3457 \                         DAEMON_PORT=3458 \
FIGMA_CLI_TARGET="My File" \               FIGMA_CLI_TARGET="My File" \
FIGMA_CLI_PAGE=5:2 node src/index.js ...   FIGMA_CLI_PAGE=8:1623 node src/index.js ...
```

`--page <id>` sets it per command and beats the env var. `figma-cli status`
shows the active scope. With a scope set:
- `--query` searches that page instead of `currentPage`
- `--node` fails loudly if an id lives on another page (page-scope violation)
- the selection fallback is refused — selection is shared tab state
- `eval` / `run` refuse code touching `figma.currentPage`, and always refuse
  `setCurrentPageAsync` (it yanks the tab out from under the other agent).
  Resolve the page instead: `const page = await figma.getNodeByIdAsync("5:2");
  await page.loadAsync();` then `page.findAll(...)` / `page.appendChild(n)`.
  `--unsafe-current-page` overrides the read check if you truly need it.
- `render` / `render-batch` place new frames on the scoped page instead of the
  active one, in free space to the right of what's already there. Relative
  layout (`--gap`, `--direction`) is preserved.

Still one agent per *page*, and shared resources (components, styles,
variables, page order) stay off-limits to both unless you agree who owns them.

## Golden rules
1. **Create frames with `render` / `render-batch`** — they have smart positioning.
   NEVER use `eval` to create visual nodes (no positioning, bypasses guards).
2. **"N buttons/cards" = N separate top-level nodes**, not one wrapper frame
   containing N children. Use `render-batch '[...]'` or `shadcn add <c> --count N`.
3. **Never delete the user's existing nodes.**
4. After creating, **verify**: `figma-cli verify "<id>" --measure` (returns a
   screenshot + real w/h so you catch size bugs by numbers, not by eye).

## Design tokens / variables
- Bind colors at creation with `var:name`, never raw hex when a system is loaded:
  `<Frame bg="var:primary"><Text color="var:on-primary">Go</Text></Frame>`
- Pin a named collection when the user names one: `render-batch ... --collection figma`.
- Import a system: `figma-cli import tailwind.config.js | globals.css | tokens.json`.
- Export the open file's system: `figma-cli extract` → DESIGN.md.

## JSX cheatsheet (render)
- Layout: `flex="row|col" gap={16} p={24} px py pt pr pb pl justify="center|between" items="center"`
- Size: `w={320} h={200} w="fill" w="hug" w="60%"` (percent resolves vs parent)
- Look: `bg="#fff" stroke="#000" strokeWidth={2} rounded={12} shadow="..." opacity={0.8}`
- Text: `<Text size={14} weight="semibold" color="#000" lineHeight={20} truncate maxLines={2} w="fill">`
- Icons (real SVG, never emojis): `<Icon name="lucide:home" size={20} color="var:primary" />`
- Dividers: a thin child (`<Frame w={1} bg="var:border" />`) auto-fills the cross axis.

## Text wrapping (most common bug)
For text to wrap, the parent AND every `<Text>` need `w="fill"`, and the parent
needs `flex="col"` or `flex="row"`.

## Recreating a component from an extracted DESIGN.md (hard rule)
Don't read the structure markdown by hand. Use:
- `figma-cli spec <Component>` → authoritative variant axes + sample size (compact).
  Build EXACTLY to those axes (e.g. Variant × Size = a Component Set, not one node).
- `figma-cli spec <Component> --check <nodeId>` → enforces it (exit 1 on mismatch:
  wrong structure, missing axes, wrong height). Treat non-zero as "not done".

## Handy commands
```
figma-cli connect                      # connect to Figma Desktop (yolo)
figma-cli render '<Frame>...</Frame>'  # one frame
figma-cli render-batch '[ "<Frame>", ... ]' --direction row
figma-cli shadcn add button --count 3  # N distinct shadcn primitives
figma-cli node to-component "<id>"     # promote to a component
figma-cli verify "<id>" --measure      # screenshot + dimensions
figma-cli a11y audit                   # contrast / touch / text checks
```

# Per-file memory

Agent sessions forget everything between chats, and when several chats work
on several Figma files their notes pile up in one heap. Per-file memory gives
every Figma file one **hub note**, so a new session can answer "what did we do
on file X?" by reading a single file, and every session leaves a dated line in
that hub after it works on the file.

Notes are plain markdown on your machine. Nothing is uploaded anywhere.

## Layout

```
figma-memory/                 # or $FIGMA_CLI_MEMORY_DIR, or --dir
├── MEMORY.md                 # index; the "Figma files" block is managed
├── file-web-app.md           # one hub per Figma file
└── file-marketing-site.md
```

A hub looks like this:

```markdown
---
name: file-web-app
description: "Hub for Figma file \"Web App\": pages, what was done there and when."
metadata:
  type: project
  figma_file: "Web App"
---

# Figma file: Web App

## Pages
- Home (1:2)
- Checkout (4:10)

## Timeline (newest first)
- 2026-03-02: [Checkout] built the payment step, 6 states
- 2026-03-01: [Home] hero + nav rebuilt from the new tokens
```

- `figma_file` ties the hub to the Figma file's name, so the hub's filename
  can be anything. One hub may cover a family of files:
  `figma_files: ["App hi-fi", "App wireframes"]`.
- **Pages** may be a list or a table; a page counts as recorded once its id
  appears anywhere in the hub.
- Add your own sections (decisions, open items, links to detailed notes)
  freely; the command only touches **Pages**, **Timeline** and the index block.
- The index keeps everything outside its
  `<!-- figma-files:start -->` / `<!-- figma-files:end -->` markers untouched,
  so it can share a file with your other notes.

## Commands

```bash
figma-cli memory log "built the payment step, 6 states"   # connected file + page
figma-cli memory log --page 4:10 "..."                    # record a specific page
figma-cli memory log --file "Web App" --skip-page "..."   # no Figma lookup
figma-cli memory show                                     # hub of the connected file
figma-cli memory show "Web App"
figma-cli memory list                                     # every hub + newest line
```

The memory folder resolves `--dir`, then `$FIGMA_CLI_MEMORY_DIR`, then
`./figma-memory`. Point it at your agent's own memory folder to keep
everything in one place (for Claude Code, the project's `memory/` folder).

## The rule for agents

Put this in your project's CLAUDE.md / AGENTS.md:

```markdown
## Memory is organised by Figma file
- Asked what was done on a Figma file: run `figma-cli memory show "<file>"`
  (or read its hub `file-<slug>.md`) before answering.
- After any task that changes a Figma file: `figma-cli memory log "<what you
  did, with node ids>"` in the same task. A new file gets its hub automatically.
- Keep entries one line, past tense, with ids; put details in other notes and
  link them from the hub.
```

Keep the memory folder out of git if it holds client names, ids or
decisions (`figma-memory/` is a good `.gitignore` line).

# Commands Reference

## FigJam Commands

FigJam has its own command group with direct CDP connection (bypasses figma-use):

```bash
# List open FigJam pages
figma-cli figjam list
figma-cli fj list  # alias

# Show page info
figma-cli fj info

# List elements on page
figma-cli fj nodes
figma-cli fj nodes --limit 50

# Create sticky note
figma-cli fj sticky "Hello World!" -x 100 -y 100
figma-cli fj sticky "Yellow Note" -x 200 -y 100 --color "#FEF08A"

# Create shape with text
figma-cli fj shape "Box Label" -x 100 -y 200 -w 200 -h 100
figma-cli fj shape "Diamond" -x 300 -y 200 --type DIAMOND

# Create text
figma-cli fj text "Plain text" -x 100 -y 400 --size 24

# Connect two nodes
figma-cli fj connect "2:30" "2:34"

# Move a node
figma-cli fj move "2:30" 500 500

# Update text content
figma-cli fj update "2:30" "New text content"

# Delete a node
figma-cli fj delete "2:30"

# Execute JavaScript in FigJam
figma-cli fj eval "figma.currentPage.children.length"
```

### Shape Types

- `ROUNDED_RECTANGLE` (default)
- `RECTANGLE`
- `ELLIPSE`
- `DIAMOND`
- `TRIANGLE_UP`
- `TRIANGLE_DOWN`
- `PARALLELOGRAM_RIGHT`
- `PARALLELOGRAM_LEFT`

### Page Selection

All FigJam commands support `-p` or `--page` to target a specific page:

```bash
figma-cli fj sticky "Note" -p "My Board" -x 100 -y 100
```

---

## Setup & Connection

```bash
# Initial setup (patches Figma, installs dependencies)
figma-cli

# Connect to running Figma
figma-cli connect
```

## Design Tokens

```bash
# IDS Base Design System (71 variables, 5 collections)
figma-cli tokens ds

# Tailwind CSS colors (220 variables)
figma-cli tokens tailwind

# Spacing scale (4px base)
figma-cli tokens spacing

# Border radii
figma-cli tokens radii
```

## Design Export (extract)

Scan the open Figma file and write a DESIGN.md — tokens, structure, component
variant matrices. Output is readable by `figma-cli import` (full roundtrip).
Verified against Primer Web (Community): 67 pages, ~124k nodes, one daemon
call per page. Component sets become variant-property matrices.

```bash
# Export the full file — all pages, all 11 sections (default output: ./DESIGN.md)
figma-cli extract

# Custom output path
figma-cli extract my-system.md

# Only specific pages (case-insensitive substring match)
figma-cli extract --pages "Button,ActionMenu"

# Only the currently selected nodes
figma-cli extract --selection

# Only specific sections (comma list)
# Sections: identity, structure, color, typography, spacing,
#           depth, components, states, rules, extending, tokens
figma-cli extract --sections tokens
figma-cli extract --sections color,typography,tokens

# Force full per-page trees into DESIGN-structure/ alongside the main file
figma-cli extract --split

# Force one big file, even for huge documents
figma-cli extract --no-split

# Flags can combine
figma-cli extract output.md --pages "Icons" --sections structure,tokens --split
```

**Auto-split:** without either flag, extract estimates the token cost of the
Structure section. Above ~50k tokens (huge files — Primer Web's structure alone
is ~185k) the per-page trees are written to `DESIGN-structure/` automatically
and the main DESIGN.md keeps everything else, staying small enough (~35k tokens
for Primer) to load into a single AI context.

Re-import the output at any time:

```bash
figma-cli import DESIGN.md
```

## Per-file memory

One hub note per Figma file, so agent sessions know what was done where.
Full guide: [MEMORY.md](MEMORY.md).

```bash
figma-cli memory log "built the payment step"   # dated line in the connected file's hub
figma-cli memory log --page 4:10 "..."           # record a specific page
figma-cli memory log --file "Web App" --skip-page "..."  # no Figma lookup
figma-cli memory show [file]                     # print a hub
figma-cli memory list                            # every hub + newest entry
```

Folder: `--dir`, else `$FIGMA_CLI_MEMORY_DIR`, else `./figma-memory`.

## Import (all sources)

`figma-cli import <source>` accepts DESIGN.md files, Tailwind configs, CSS
custom-property files, W3C design-tokens JSON and Storybook (URL or static build).

```bash
# DESIGN.md — original extraction format (all three sub-formats)
figma-cli import DESIGN.md
figma-cli import DESIGN.md -c "my-brand"

# Tailwind config — colors, radii, spacing, font families
figma-cli import tailwind.config.js
figma-cli import tailwind.config.cjs -c "tw-tokens"

# CSS custom properties — @layer base, @theme, shadcn HSL triples, oklch
figma-cli import src/globals.css
figma-cli import styles.css -c "css-vars"

# W3C design-tokens JSON (Style Dictionary, Tokens Studio)
figma-cli import tokens.json
figma-cli import design-tokens.json -c "brand"

# Storybook — component context only (no tokens created)
figma-cli import http://localhost:6006
figma-cli import ./storybook-static/
```

### Options

| Option | Description |
|--------|-------------|
| `-c, --collection <name>` | Variable collection name |
| `--save <file>` | Write the converted DESIGN.md to a path |
| `--type <type>` | Override source-type detection (tailwind, css, tokens, storybook, designmd) |
| `--print-context` | Print figmachat context summary without creating variables |

### Storybook behavior

Storybook's `index.json` carries component names and story variants, not design
tokens. The import:

1. Saves a `DESIGN-storybook.md` in the current directory (or `--save` path).
2. Prints the component list with variant counts.
3. Does NOT create Figma variables.

Combine with a CSS or Tailwind import to get both tokens and component context:

```bash
figma-cli import http://localhost:6006
figma-cli import tailwind.config.js
```

## Variables

```bash
# List all variables
figma-cli var list

# Create a variable
figma-cli var create "primary/500" -c "CollectionId" -t COLOR -v "#3b82f6"

# Find variables by pattern
figma-cli var find "primary/*"
```

## Collections

```bash
# List collections
figma-cli col list

# Create collection
figma-cli col create "Color - Semantic"
```

## Create Elements

```bash
# Create a frame
figma-cli create frame "Card" -w 320 -h 200 --fill "#ffffff" --radius 12

# Create an icon (Iconify, 150k+ icons)
figma-cli create icon lucide:star -s 24 -c "#f59e0b"
figma-cli create icon mdi:home -s 32 -c "#3b82f6"
```

## JSX Rendering

```bash
# Create complex UI from JSX
figma-cli render '<Frame w={320} h={200} bg="#fff" rounded={12} p={24} flex="col" gap={16}>
  <Text size={18} weight="bold" color="#111">Card Title</Text>
  <Text size={14} color="#666">Description</Text>
</Frame>'
```

## Export

```bash
# Screenshot current view
figma-cli export screenshot -o screenshot.png

# Export variables as CSS custom properties
figma-cli export css

# Export as Tailwind config
figma-cli export tailwind
```

## Raw Commands

```bash
# Execute arbitrary JavaScript
figma-cli eval "figma.currentPage.name"

# Run figma-use commands directly
figma-cli raw query "//COMPONENT"
figma-cli raw lint
figma-cli raw select "1:234"
figma-cli raw export "1:234" --scale 2
```

## Query Syntax

The query command uses XPath-like syntax:

```bash
# All frames
figma-cli raw query "//FRAME"

# Frames with specific name
figma-cli raw query "//FRAME[@name='Card']"

# All components
figma-cli raw query "//COMPONENT"

# All groups
figma-cli raw query "//GROUP"

# Name starts with
figma-cli raw query "//*[@name^='session-']"

# Name contains
figma-cli raw query "//*[contains(@name, 'Button')]"
```

## Selection

```bash
# Select by ID
figma-cli raw select "1:234"

# Select multiple
figma-cli raw select "1:234,1:235,1:236"

# Clear selection
figma-cli eval "figma.currentPage.selection = []"
```

## Export Nodes

```bash
# Export at 2x scale
figma-cli raw export "1:234" --scale 2

# Export with suffix
figma-cli raw export "1:234" --scale 2 --suffix "_dark"
```

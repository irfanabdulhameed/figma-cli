# FigJam Support

## Overview

`figma-cli` includes full FigJam support via CLI commands and a programmatic client, connecting directly via Chrome DevTools Protocol (CDP).

## CLI Commands

```bash
# List open FigJam pages
figma-cli figjam list
figma-cli fj list  # alias

# Show page info
figma-cli fj info

# List elements on page
figma-cli fj nodes

# Create sticky note
figma-cli fj sticky "Hello World!" -x 100 -y 100

# Create shape with text
figma-cli fj shape "Box Label" -x 100 -y 200 -w 200 -h 100

# Create text
figma-cli fj text "Plain text" -x 100 -y 400 --size 24

# Connect two nodes
figma-cli fj connect "2:30" "2:34"

# Move, update, delete
figma-cli fj move "2:30" 500 500
figma-cli fj update "2:30" "New text"
figma-cli fj delete "2:30"

# Execute JavaScript
figma-cli fj eval "figma.currentPage.children.length"
```

### All Options

| Command | Options |
|---------|---------|
| `sticky <text>` | `-x`, `-y`, `-c/--color`, `-p/--page` |
| `shape <text>` | `-x`, `-y`, `-w/--width`, `-h/--height`, `-t/--type`, `-p/--page` |
| `text <content>` | `-x`, `-y`, `-s/--size`, `-p/--page` |
| `connect <start> <end>` | `-p/--page` |
| `move <id> <x> <y>` | `-p/--page` |
| `update <id> <text>` | `-p/--page` |
| `delete <id>` | `-p/--page` |
| `eval <code>` | `-p/--page` |
| `nodes` | `-l/--limit`, `-p/--page` |

## Why a Custom Client?

The `figma-use` library crashes on FigJam with:
```
TypeError: Cannot read properties of undefined (reading 'loadFontAsync')
```

This is because FigJam's Plugin API differs from Figma Design:
- Different node types (STICKY, SHAPE_WITH_TEXT, CONNECTOR)
- Font loading is required before setting text
- Some Figma Design APIs don't exist in FigJam

## Usage

### As a Module

```javascript
import { FigJamClient } from './src/figjam-client.js';

const client = new FigJamClient();

// List available FigJam pages
const pages = await FigJamClient.listPages();

// Connect to a page
await client.connect('My Board');

// Get page info
const info = await client.getPageInfo();

// Create elements
const sticky = await client.createSticky('Hello!', 100, 100);
const shape = await client.createShape('Box', 100, 200, 200, 80);
const connector = await client.createConnector(sticky.id, shape.id);

// Custom eval
const result = await client.eval('figma.currentPage.children.length');

client.close();
```

### Available Methods

| Method | Description |
|--------|-------------|
| `listPages()` | Static: List all open FigJam pages |
| `connect(title)` | Connect to FigJam page by title |
| `getPageInfo()` | Get current page name, id, child count |
| `listNodes(limit)` | List nodes on current page |
| `createSticky(text, x, y, color)` | Create a sticky note |
| `createShape(text, x, y, w, h, type)` | Create shape with text |
| `createConnector(startId, endId)` | Connect two nodes |
| `createText(text, x, y, fontSize)` | Create text node |
| `deleteNode(nodeId)` | Delete a node |
| `moveNode(nodeId, x, y)` | Move a node |
| `updateText(nodeId, text)` | Update text content |
| `eval(expression)` | Execute arbitrary JS |
| `close()` | Close connection |

### Shape Types

For `createShape()`, valid shape types:
- `ROUNDED_RECTANGLE` (default)
- `RECTANGLE`
- `ELLIPSE`
- `DIAMOND`
- `TRIANGLE_UP`
- `TRIANGLE_DOWN`
- `PARALLELOGRAM_RIGHT`
- `PARALLELOGRAM_LEFT`

## Test Script

```bash
node test-figjam.js
```

## Architecture

```
┌─────────────────┐      WebSocket (CDP)     ┌─────────────────┐
│  FigJamClient   │ ◄──────────────────────► │  FigJam Tab     │
│                 │      Runtime.evaluate     │  (in Figma)     │
└─────────────────┘                          └─────────────────┘
```

1. Fetch available pages from `http://localhost:9222/json`
2. Connect to FigJam page's WebSocket debugger URL
3. Enable `Runtime` domain
4. Find execution context with `figma` global
5. Execute JS via `Runtime.evaluate`

## Known Issues

### IDS AIVCC 2026 Page Not Working

Some FigJam pages don't expose the `figma` context immediately. This might be related to:
- Page not fully loaded
- Different internal state
- Large file size

**Workaround:** Try refreshing the FigJam page, or use a different FigJam file.

### Font Loading

All text operations require font loading first. The client handles this automatically with:
```javascript
await figma.loadFontAsync({ family: "Inter", style: "Medium" });
```

## Differences from Figma Design

| Feature | Figma Design | FigJam |
|---------|--------------|--------|
| `figma.editorType` | `"figma"` | `"figjam"` |
| Sticky notes | Not available | `figma.createSticky()` |
| Connectors | Not available | `figma.createConnector()` |
| Shape with text | Not available | `figma.createShapeWithText()` |
| Components | Available | Limited |
| Variables | Full support | Limited |
| Auto Layout | Full support | Not available |

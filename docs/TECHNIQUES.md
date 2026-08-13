# Advanced Techniques

## Variable Mode Switching (Library Variables)

The biggest challenge: switching variable modes (Light/Dark) when variables come from an external library.

### The Problem

- `figma.variables.getLocalVariableCollections()` only returns local collections
- Library variables are not directly accessible
- You cannot import library collections programmatically

### The Solution

Access the collection through bound variables on nodes:

```javascript
const node = figma.getNodeById('1:92');

function findModeCollection(n) {
  if (n.boundVariables) {
    for (const [prop, binding] of Object.entries(n.boundVariables)) {
      const b = Array.isArray(binding) ? binding[0] : binding;
      if (b && b.id) {
        try {
          const variable = figma.variables.getVariableById(b.id);
          if (variable) {
            const col = figma.variables.getVariableCollectionById(variable.variableCollectionId);
            if (col && col.modes.length > 1) {
              return { col, modes: col.modes };
            }
          }
        } catch(e) {}
      }
    }
  }
  if (n.children) {
    for (const c of n.children) {
      const found = findModeCollection(c);
      if (found) return found;
    }
  }
  return null;
}

const found = findModeCollection(node);
if (found) {
  const lightMode = found.modes.find(m => m.name.includes('Light'));
  if (lightMode) {
    node.setExplicitVariableModeForCollection(found.col, lightMode.modeId);
  }
}
```

### Apply to Multiple Nodes

```javascript
const ids = ['1:92', '1:112', '1:134', '1:154', '1:179'];
ids.forEach(id => {
  const n = figma.getNodeById(id);
  if (n) n.setExplicitVariableModeForCollection(found.col, lightMode.modeId);
});
```

---

## Scaling from Corners

### The Problem

Using `resize()` can break layers and distort content.

### The Solution

Use `rescale()` which scales proportionally, then reposition:

```javascript
// Scale from top-right corner
const node = figma.getNodeById('1:92');
const oldRight = node.x + node.width;
const oldTop = node.y;

node.rescale(1.2);

// Maintain top-right position
node.x = oldRight - node.width;
node.y = oldTop;
```

### Scale and Center

```javascript
const frameW = 1920, frameH = 1080;

node.rescale(1.2);
node.x = (frameW - node.width) / 2;
node.y = (frameH - node.height) / 2;
```

---

## Batch Operations

### Rename Multiple Nodes

```javascript
const page = figma.currentPage;
const frames = page.children.filter(n => n.name.startsWith('Stream-'));

frames.forEach((frame, i) => {
  frame.name = `session-${i + 1}`;
});
```

### Rename Children Inside Frames

```javascript
const sessions = page.children.filter(n => n.name.startsWith('session-'));

sessions.forEach(session => {
  const group = session.children.find(c => c.type === 'GROUP');
  if (group) group.name = 'content';
});
```

### Different Scaling Based on Content

```javascript
sessions.forEach(session => {
  const content = session.children.find(c => c.name === 'content');
  if (!content) return;

  // Check parent frame name for logic
  const parentName = session.parent?.name || '';
  const scale = parentName.includes('One Speaker') ? 1.2 : 1.1;

  content.rescale(scale);
  content.x = (1920 - content.width) / 2;
  content.y = (1080 - content.height) / 2;
});
```

---

## Export with Custom Naming

```javascript
// Export all sessions with suffix
const sessions = page.children.filter(n => n.name.startsWith('session-'));

for (const session of sessions) {
  // Use figma-use export command
  // figma-cli raw export "SESSION_ID" --scale 2 --suffix "_dark"
}
```

Via CLI:
```bash
figma-cli raw export "1:90" --scale 2 --suffix "_dark"
```

---

## Working with Selections

### Select Nodes Programmatically

```javascript
const nodes = ['1:92', '1:112', '1:134'].map(id => figma.getNodeById(id)).filter(Boolean);
figma.currentPage.selection = nodes;
```

### Clear Selection

```javascript
figma.currentPage.selection = [];
```

### Get Current Selection

```javascript
const selected = figma.currentPage.selection;
selected.map(n => n.name + ' (' + n.id + ')').join(', ');
```

---

## Debugging Tips

### Eval Returns No Output

Sometimes eval commands execute but return nothing. The code still runs. Verify by:

1. Query the nodes after: `figma-cli raw query "//GROUP"`
2. Check properties changed: look at sizes, positions, names

### Finding Node IDs

```bash
# Query returns IDs in format: [TYPE] "name" (ID) dimensions
figma-cli raw query "//FRAME"
# Output: [FRAME] "session-1" (1:90) 1920×1080
```

### Check Node Structure

```javascript
const node = figma.getNodeById('1:90');
node.children.map(c => c.name + ' (' + c.type + ')').join(', ');
```

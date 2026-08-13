# Architecture

## How figma-cli Works

```
┌─────────────────┐      Chrome DevTools      ┌─────────────────┐
│  figma-cli   │ ◄────── Protocol ───────► │  Figma Desktop  │
│     (CLI)       │      (localhost:9222)     │                 │
└─────────────────┘                           └─────────────────┘
```

### Technology Stack

1. **Chrome DevTools Protocol (CDP)**: Figma Desktop is an Electron app with a Chromium runtime. We connect via CDP on port 9222.

2. **figma-use**: The underlying library that handles CDP connection and JavaScript execution. Our CLI wraps this.

3. **Figma Plugin API**: We execute JavaScript against the global `figma` object, which provides full access to the Figma Plugin API.

### Connection Flow

1. User runs `figma-cli connect`
2. CLI patches Figma to enable remote debugging (adds `--remote-debugging-port=9222` flag)
3. Figma restarts with debugging enabled
4. CLI connects via WebSocket to `localhost:9222`
5. Commands are executed as JavaScript in Figma's context

### Key Files

```
figma-cli/
├── src/
│   ├── index.js          # Entry point: imports lib + command modules, program.parse()
│   ├── lib/cli-core.js   # Shared core: daemon plumbing, eval helpers, config, program
│   ├── commands/         # One module per command group (setup, variables, tokens,
│   │                     # render, a11y, slots, variants, ... 18 modules)
│   ├── figma-client.js   # JSX parser + Figma Plugin API code generator
│   └── daemon.js         # Background daemon (CDP + plugin WebSocket bridge)
├── package.json      # npm package config
├── README.md         # User documentation
└── docs/             # Technical documentation
```

### No API Key Required

Unlike the Figma REST API which requires authentication, we use the Plugin API directly through the desktop app. This means:

- Full read/write access to everything
- No rate limits
- Access to features not available in REST API (like variable modes)
- Works with the user's existing Figma session

### Limitations

- macOS only (for now)
- Requires Figma Desktop (not web)
- One Figma instance at a time
- Some eval commands don't return output (but still execute)

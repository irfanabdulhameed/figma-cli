# figma-cli

<p align="center">
  <img src="https://img.shields.io/badge/Figma-Desktop-purple" alt="Figma Desktop">
  <img src="https://img.shields.io/badge/No_API_Key-Required-green" alt="No API Key">
  <img src="https://img.shields.io/badge/No_MCP-Required-green" alt="No MCP Required">
  <img src="https://img.shields.io/badge/No_Rate_Limits-✓-green" alt="No Rate Limits">
  <img src="https://img.shields.io/badge/Works_in-Claude_Code-D97757?logo=claude&logoColor=white" alt="Works in Claude Code">
  <a href="#setup-with-cursor"><img src="https://img.shields.io/badge/Works_in-Cursor-000000?logo=cursor&logoColor=white" alt="Works in Cursor"></a>
  <a href="#setup-with-codex"><img src="https://img.shields.io/badge/Works_in-Codex-412991?logo=openai&logoColor=white" alt="Works in Codex"></a>
</p>

<p align="center">
  <b>Talk in plain English. Watch Figma build.</b><br>
  You describe what you want — an AI assistant builds it live in your Figma Desktop.<br>
  No API key. No copy-paste. No plugin to babysit. No code to write.
</p>

---

## Contents

1. [What is this?](#what-is-this)
2. [Quick start](#quick-start) — [Claude Code](#setup-with-claude-code) · [Cursor](#setup-with-cursor) · [Codex](#setup-with-codex)
3. [What you can ask for](#what-you-can-ask-for)
4. [How it connects: Yolo vs Safe mode](#how-it-connects-to-figma-yolo-vs-safe-mode)
5. [Bring your own design system](#bring-your-own-design-system)
6. [Export any Figma file as DESIGN.md](#export-any-figma-file-as-designmd)
7. [figma-cli vs MCP servers](#figma-cli-vs-the-mcp-servers)
8. [Everything it can do](#everything-it-can-do)
9. [For developers](#for-developers)

---

## What is this?

figma-cli lets an **AI assistant build directly in your Figma Desktop** while you talk to it in normal language.

You don't run commands or write code. You open your AI assistant in this project and say things like:

> "Create three pricing cards."
> "Use my brand's design system."
> "Make those buttons look like Stripe."
> "Check the contrast on this screen."

The AI does the rest. Figma updates in real time, in front of you.

It produces real, editable Figma — actual frames, components, variants and variables, not a flat image. And it runs **locally**: no API key, nothing sent to a cloud service, no rate limits ([why](#figma-cli-vs-the-mcp-servers)).

---

## Quick start

You never install this by hand — your AI assistant does it for you. It takes three steps regardless of which assistant you use:

| Step | What you do |
|---|---|
| **1. Prepare** | Install [Figma Desktop](https://www.figma.com/downloads/) and open it. Install your AI assistant (guides below). |
| **2. Install** | Tell the assistant to download this project and set it up. One sentence. |
| **3. Design** | Describe what you want. Figma builds it in front of you. |

Pick your assistant:

- **[Claude Code](#setup-with-claude-code)** — recommended, what most people use
- **[Cursor](#setup-with-cursor)**
- **[Codex](#setup-with-codex)** — OpenAI's coding agent

All three drive the exact same CLI. The tool controls Figma Desktop, not your editor, so nothing about it is tied to one assistant.

### Setup with Claude Code

**You need:** Figma Desktop (open) and [Claude Code](https://docs.claude.com/en/docs/claude-code) (one command to install).

**1. Get the project.** Open Claude Code anywhere and paste:

> "Download the figma-cli project from https://github.com/irfanabdulhameed/figma-cli into a folder in my home directory, then go into it."

(Or click the green **Code** button on GitHub → **Download ZIP** → unzip.)

**2. Install and connect.** Open Claude Code **inside the project folder** and say:

> "Set up figma-cli and connect it to my Figma."

Claude reads the project's instructions (`CLAUDE.md`), installs what's needed, and connects to your open Figma Desktop. When it says it's connected, you're done. ✅

**3. Start designing:**

> "Add my brand colors, then create a primary button and a secondary button."

### Setup with Cursor

**You need:** Figma Desktop (open) and [Cursor](https://cursor.com).

**1. One line does everything.** Open Cursor in any folder, open the Agent chat, and paste:

> **"Install github.com/irfanabdulhameed/figma-cli and connect it to my Figma."**

Cursor downloads the project, installs it, writes its own rules file, and connects to Figma. Under the hood it runs `figma-cli init-agent`, which drops `.cursor/rules/figma-cli.mdc` into the project — the file that teaches Cursor's Agent the rules (use real variables, wrap text properly, build N items as N components). You never edit it.

**2. Start designing** — same as Claude Code:

> "Add my brand colors, then create a primary button and a secondary button."

### Setup with Codex

**You need:** Figma Desktop (open) and [Codex CLI](https://developers.openai.com/codex/cli/) (`npm i -g @openai/codex`).

Codex reads **`AGENTS.md`** — the standard agent-instructions file — and this project ships one, so Codex knows how to drive figma-cli out of the box.

**1. Get the project.** In a terminal:

```bash
git clone https://github.com/irfanabdulhameed/figma-cli ~/figma-cli
cd ~/figma-cli
```

(No git? Download the ZIP from GitHub instead and open a terminal in the unzipped folder.)

**2. Install and connect.** Start Codex inside the folder and say:

> "Set up figma-cli and connect it to my Figma."

Codex reads `AGENTS.md`, runs the install, and connects to your open Figma Desktop. If the file is ever missing, run `figma-cli init-agent` once — it regenerates `AGENTS.md` (which Claude Code and Cursor also read) without touching anything else.

> **Tip:** run Codex with workspace write access (e.g. `codex --full-auto`) so it can install dependencies and talk to the local daemon without asking on every step.

**3. Start designing:**

> "Add my brand colors, then create a primary button and a secondary button."

---

## What you can ask for

Just say it in plain language. You never memorize commands — the AI knows them; you describe the outcome.

**Build things**
- "Create 5 pricing cards in a row."
- "Make a login form."
- "Build a dashboard layout."
- "Add a dialog / a calendar / a sidebar." *(40+ shadcn/ui components available)*

**Use a design system**
- "Add shadcn colors" or "add Tailwind colors."
- "Make these in Stripe's style" / "use the Linear design system."
- "Use my brand's variables on these cards."

**Bring your own brand**
- "Import this design system." *(point it at a `DESIGN.md` file — see below)*
- "Switch this design from Stripe to Apple." *(swap a whole layout between brands)*
- "Export this file's design system as markdown." *(any open file → `DESIGN.md`)*

**Polish & hand off**
- "Check the color contrast / touch targets / text sizes."
- "Export this as PNG / SVG."
- "Turn this into a reusable component with Small / Medium / Large variants."

---

## How it connects to Figma: Yolo vs Safe mode

figma-cli talks to Figma Desktop in one of two ways. Your AI picks one during setup — here's what they mean:

### ⚡ Yolo Mode — the default, recommended
- **Fully automatic.** The AI sets it up; you do nothing.
- Applies a **small, reversible patch** to the Figma Desktop app so the CLI can talk to it directly. That's what makes it fast and hands-off — no plugin to keep open, no clicking.
- "Yolo" sounds scary, but it's **safe and undoable** — the AI can un-patch anytime, and nothing ever leaves your machine.
- Just say *"connect to Figma"*.

### 🛡️ Safe Mode — no changes to the Figma app
- **Doesn't touch the Figma app at all.** Uses a tiny built-in Figma plugin instead.
- Run it once from Figma's **Plugins → Development → FigCli** and keep the plugin open while you work.
- A little more manual, but **zero modifications** to Figma — good if you (or your company's IT policy) don't want the app patched.
- Say *"connect to Figma in safe mode"*.

**Both do exactly the same things.** Unsure? Use Yolo. Want nothing changed on your Figma app? Use Safe. Switch anytime — just ask.

---

## Bring your own design system

Have a brand or a design system? Put it in a single `DESIGN.md` file (colors, type, spacing) and say:

> "Import ~/Downloads/my-DESIGN.md into Figma."

It creates real Figma variables (`primary`, `canvas`, `ink`, `accent`, …) you can use everywhere — and you can switch a design between systems on demand ("now make it look like Vercel").

`DESIGN.md` isn't the only way in. Point `figma-cli import` directly at the source files your project already has:

| Source | What you get |
|---|---|
| **Tailwind config** (`tailwind.config.js`) | Colors, radii, spacing and font families as Figma variables |
| **CSS custom properties** (`globals.css`) | shadcn HSL triples, Tailwind v4 `@theme` blocks, oklch |
| **Design-tokens JSON** (`tokens.json`) | W3C design-tokens & Style Dictionary, with alias resolution |
| **Storybook** (`localhost:6006` or static build) | Component inventory (names, variants) as AI context — combine with a CSS/Tailwind import for tokens |

Ask: "Import my tailwind config" or "load our storybook at localhost:6006" — the AI handles the rest.

---

## Export any Figma file as DESIGN.md

The reverse also works. Open any Figma file — yours, a client's, a Community file like GitHub's Primer — and say:

> "Export the design system as markdown."

figma-cli scans **every page** (no truncation, even on 100k+ node files) and writes a `DESIGN.md` with the full token map: colors ranked by usage, the type scale, spacing, radii, shadows, plus a variant matrix for every component set. If the file defines real **variable collections**, it captures those too — every variable with its real name, all its modes (light/dark, high-contrast, …) and alias chains. The file round-trips: `figma-cli import` recreates those collections faithfully in any other file.

What it's for:

- **Feed your design system to AI tools** — Claude, Cursor, Codex and Copilot read `DESIGN.md` and build UI that actually matches your Figma file
- **Reuse, don't rebuild** — every exported component carries a *reuse handle*; ask for one that exists and the AI drops a real instance (`figma-cli instantiate "Button"`) instead of a divergent copy
- **Document a design system** — one command instead of hand-written token tables
- **Transfer variables between files** — extract from file A, import into file B with every mode and alias intact
- **Learn from Community files** — extract Primer, Material or any public system and see exactly how it's built

Huge files stay usable: when structure trees alone would blow an AI context window, they split into per-page files automatically and the main `DESIGN.md` stays loadable (Primer Web: 67 pages, 124k nodes → a 35k-token main file).

---

## figma-cli vs the MCP servers

How does this differ from **Figma's official MCP** and **figma-console-mcp**? Short version: they talk to Figma through the **cloud REST API**; figma-cli talks to **Figma Desktop directly on your machine**. That one choice changes everything downstream.

| | **figma-cli** | Figma official MCP / figma-console-mcp |
|---|---|---|
| **How it connects** | CDP → your local Figma Desktop | Figma REST API (cloud) |
| **Figma token** | not needed | required (`figd_…`) |
| **Figma rate limit** | **none** (no API calls to throttle) | yes (as low as 6 read calls/month per seat) |
| **Works offline** | yes | no |
| **Setup** | one `connect` command | token + plugin/bridge + port wrangling |

### No rate limit is a structural advantage
Figma's APIs are rate-limited, and any tool built on them hits the same ceiling: just **6 read calls per month** on a View/Collab seat, and **200–600 per day** even on a paid Dev/Full seat ([source](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access)). AI agents read constantly, burn through those fast, then sit in 429 cooldowns. figma-cli never calls the API — it drives Figma Desktop locally over CDP. No token, no 429, works offline.

### It also costs your AI far fewer tokens
figma-cli's commands are terse and load **no large tool schemas into the AI's context**. An MCP server loads instructions + dozens of tool schemas and returns verbose JSON. Measured like-for-like (tokens ≈ bytes ÷ 4, approximate):

| Task | figma-cli | API-based MCP |
|---|---:|---:|
| Cold start → first component | **~140 tok** | ~1,600 tok (**~11×**) |
| Generate one token-bound component | **~68 tok** | ~256–556 tok (**~4–8×**) |

On a fixed AI plan, fewer tokens per task means more done before hitting *your AI's* usage limits — and a leaner context means the AI keeps its facts straight instead of "forgetting" node IDs as the window fills.

---

## Works offline / with local AI

Prefer to keep everything on your machine? figma-cli also works with **local LLMs** (via LM Studio or Ollama) — fully offline, no cloud, no key. Ask your assistant to "set up the local LLM agent" and it walks you through it.

---

## Everything it can do

**40+ ready components · 30+ capabilities · 8 areas.** You trigger any of these just by asking.

**🧩 Components**
- 40+ shadcn/ui components (buttons, cards, inputs, dialogs, tabs, calendar, sidebar, …) with real Lucide icons
- Turn anything into a reusable **component** with **variants** (Size, State, …)
- Build **slots** for flexible, composable components
- Combine existing frames into a variant set

**🎨 Design systems & tokens**
- One-command presets: **shadcn** (Light/Dark) and **Tailwind** color scales
- **Import your own brand** from `DESIGN.md`, Tailwind, CSS, or tokens JSON
- **Switch a design between brands** (Stripe → Apple → your brand)
- Visualize a whole palette on the canvas

**🖼️ Visuals & effects**
- Drop/inner shadows, layer & background blur, glassmorphism
- Linear, radial, angular & diamond **gradients**
- **Extract a gradient from any image** — Figma-ready fill or mesh wallpaper
- Generate **mesh-gradient wallpapers** from a color palette
- Image fills from URL, corner smoothing (iOS squircles), rotation, blend modes

**📐 Layout & structure**
- Real auto-layout (flex rows/columns, fill/hug, gaps, alignment)
- Pre-built **blocks** (full dashboards, page layouts) in one step
- Precise absolute positioning, sections, layout grids

**♿ Accessibility**
- WCAG contrast checking, touch-target sizing, text-size checks
- Color-blindness simulation
- One-shot full a11y audit

**📦 Handoff & export**
- Export **PNG, SVG, JSX**, Storybook stories, CSS variables, Tailwind config, **DTCG / W3C tokens JSON**
- Link components to **Storybook / GitHub / docs**, inline annotations
- Recreate a live webpage in Figma from a URL

**🤖 Built for AI**
- Works with **Claude Code, Cursor, or Codex** — one `figma-cli init-agent` sets up the rules for all of them (`AGENTS.md` + Cursor rules)
- Works with local LLMs via **LM Studio / Ollama** (fully offline)
- Ships the entire **Figma Plugin API spec offline** for self-discovery
- Screenshot-based verification (`verify --measure`) so the AI checks its own work by numbers
- Enforces a **DESIGN.md spec** when recreating components (`spec --check`)
- Optional **voice control** (macOS): "create three pricing cards" out loud

**🔒 No strings**
- No API key, no cloud roundtrip, no plugin store waits
- Talks to Figma Desktop directly — real, editable Figma every time

---

## For developers

Everything above is powered by a CLI the AI calls for you. If you want to use it directly, script it, or see every command:

- **[REFERENCE.md](REFERENCE.md)** — full command reference (tokens, render/JSX, components, gradients, a11y, export, the offline Figma API spec, and more).
- Two connection modes: **Yolo** (direct, recommended) and **Safe** (plugin-based, no patching).

You don't need any of this to use the tool — it's here for tinkerers.

---

## Why this exists

Figma plugins are slow to build and tied to one UI. AI assistants are great at *describing intent* but need a clean way to act on Figma. figma-cli is the bridge: it talks to Figma Desktop directly, so you can design by conversation — locally, with no API key and no cloud roundtrip.

**You design. The AI builds. Figma updates.**

---

## License

MIT. Maintained by [Irfan Abdul Hameed](https://github.com/irfanabdulhameed).

/**
 * Plugin system for figma-cli.
 * Built-in registry of known plugins. Install/uninstall/setup/list.
 * Plugins are downloaded to ~/.figma-cli/plugins/<name>/
 */

import { existsSync, mkdirSync, readFileSync, rmSync, readdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import chalk from 'chalk';
import { saveKey, getKey, deleteKey, maskKey, promptKeySecure } from './credentials.js';

// ─── Plugin directory ───

const PLUGINS_DIR = join(homedir(), '.figma-cli', 'plugins');

export function ensurePluginsDir() {
  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true });
  }
  return PLUGINS_DIR;
}

export function getPluginDir(name) {
  return join(PLUGINS_DIR, name);
}

// ─── Built-in registry ───

export const REGISTRY = [
  {
    name: 'voice',
    description: 'Talk to Figma with your voice',
    commands: ['voice', 'chat'],
    requiredKeys: [
      {
        name: 'ANTHROPIC_API_KEY',
        label: 'Anthropic API key',
        hint: 'starts with sk-ant-',
        guide: [
          '',
          '  How to get your Anthropic API key (2 minutes):',
          '',
          '  1. Open  https://console.anthropic.com',
          '  2. Create a free account (or sign in)',
          '  3. Click "API Keys" on the left sidebar',
          '  4. Click "Create Key" and give it any name',
          '  5. Copy the key (starts with sk-ant-)',
          '',
          '  Your key is stored securely on your computer',
          '  and is never shared. You pay Anthropic directly.',
          '',
        ],
      },
    ],
    requirements: {
      darwin: ['ffmpeg', 'mlx_whisper'],
    },
    platformNote: {
      darwin: 'Voice uses your Mac\'s microphone + local transcription. No extra accounts needed beyond Anthropic.',
      win32: 'Voice mode is macOS-only for now. You can use "figma-cli chat" (text mode) on Windows.',
    },
  },
];

// ─── Install / Uninstall ───

export function isInstalled(name) {
  const dir = getPluginDir(name);
  return existsSync(join(dir, 'plugin.json'));
}

export function getInstalledPlugins() {
  ensurePluginsDir();
  const dirs = readdirSync(PLUGINS_DIR, { withFileTypes: true });
  return dirs
    .filter((d) => d.isDirectory() && existsSync(join(PLUGINS_DIR, d.name, 'plugin.json')))
    .map((d) => {
      const meta = JSON.parse(readFileSync(join(PLUGINS_DIR, d.name, 'plugin.json'), 'utf-8'));
      return { ...meta, path: join(PLUGINS_DIR, d.name) };
    });
}

export async function installPlugin(name) {
  const entry = REGISTRY.find((p) => p.name === name);
  if (!entry) {
    console.log(chalk.red(`Unknown plugin: ${name}`));
    console.log(`Available plugins: ${REGISTRY.map((p) => p.name).join(', ')}`);
    return false;
  }

  if (isInstalled(name)) {
    console.log(chalk.yellow(`Plugin "${name}" is already installed.`));
    console.log(`Run ${chalk.cyan(`figma-cli plugins setup ${name}`)} to reconfigure.`);
    return true;
  }

  ensurePluginsDir();
  const dir = getPluginDir(name);

  // Copy bundled plugin from plugins/ directory
  const bundledDir = join(__dirname, '..', 'plugins', name);
  if (existsSync(bundledDir) && existsSync(join(bundledDir, 'plugin.json'))) {
    try {
      cpSync(bundledDir, dir, { recursive: true });
    } catch (err) {
      console.log(chalk.red(`Failed to install plugin: ${err.message}`));
      return false;
    }
  } else {
    console.log(chalk.red(`Plugin "${name}" not found in figma-cli.`));
    return false;
  }

  console.log(chalk.green(`✓ Plugin "${name}" installed`));

  // Check platform requirements
  const platform = process.platform;
  const note = entry.platformNote?.[platform];
  if (note) {
    console.log(chalk.gray(`\n  ${note}\n`));
  }

  // Check if missing tools
  const reqs = entry.requirements?.[platform] || [];
  const missing = reqs.filter((cmd) => {
    try { execSync(`which ${cmd}`, { stdio: 'pipe' }); return false; } catch { return true; }
  });
  if (missing.length > 0) {
    console.log(chalk.yellow(`\n  Missing tools: ${missing.join(', ')}`));
    if (platform === 'darwin') {
      for (const m of missing) {
        if (m === 'ffmpeg') console.log(chalk.gray(`  Install: brew install ffmpeg`));
        if (m === 'mlx_whisper') console.log(chalk.gray(`  Install: pipx install mlx-whisper`));
      }
    }
    console.log('');
  }

  // Check if keys are configured
  const missingKeys = (entry.requiredKeys || []).filter((k) => !getKey(k.name));
  if (missingKeys.length > 0) {
    console.log(chalk.yellow(`\n  API key needed. One-time setup:\n`));
    console.log(`  Step 1: Open a NEW Terminal window`);
    console.log(chalk.gray(`          (on Mac: Cmd+Space, type "Terminal", press Enter)\n`));
    console.log(`  Step 2: Paste this command and press Enter:`);
    console.log(`          ${chalk.cyan(`figma-cli plugins setup ${name}`)}\n`);
    console.log(`  Step 3: Follow the instructions to paste your API key`);
    console.log(chalk.gray(`          (the key is hidden as you type — that's normal)\n`));
    console.log(`  Step 4: Come back here and continue using figma-cli\n`);
    console.log(chalk.gray(`  Why a separate window? So your API key stays private`));
    console.log(chalk.gray(`  and is never visible in this chat.\n`));
  }

  return true;
}

export function uninstallPlugin(name) {
  if (!isInstalled(name)) {
    console.log(chalk.yellow(`Plugin "${name}" is not installed.`));
    return;
  }
  const dir = getPluginDir(name);
  rmSync(dir, { recursive: true, force: true });

  // Also remove keys
  const entry = REGISTRY.find((p) => p.name === name);
  if (entry?.requiredKeys) {
    for (const k of entry.requiredKeys) {
      deleteKey(k.name);
    }
  }
  console.log(chalk.green(`✓ Plugin "${name}" uninstalled`));
}

// ─── Setup (secure key entry) ───

export async function setupPlugin(name) {
  const entry = REGISTRY.find((p) => p.name === name);
  if (!entry) {
    console.log(chalk.red(`Unknown plugin: ${name}`));
    return;
  }

  if (!isInstalled(name)) {
    console.log(chalk.yellow(`Plugin "${name}" is not installed yet.`));
    console.log(`Run: ${chalk.cyan(`figma-cli plugins install ${name}`)}`);
    return;
  }

  const keys = entry.requiredKeys || [];
  if (keys.length === 0) {
    console.log(chalk.green('No setup needed for this plugin.'));
    return;
  }

  for (const keyDef of keys) {
    const existing = getKey(keyDef.name);
    if (existing) {
      console.log(`\n${keyDef.label}: ${chalk.green(maskKey(existing))}`);
      const answer = await promptKeySecure('Replace it? (y/N): ');
      if (answer.toLowerCase() !== 'y') continue;
    }

    // Show guide
    if (keyDef.guide) {
      console.log(chalk.cyan('╭─────────────────────────────────────────────────╮'));
      for (const line of keyDef.guide) {
        console.log(chalk.cyan('│') + (line || ''));
      }
      console.log(chalk.cyan('╰─────────────────────────────────────────────────╯'));
    }

    const value = await promptKeySecure(`\nPaste your ${keyDef.label} (${keyDef.hint}): `);

    if (!value || value.length < 10) {
      console.log(chalk.red('Key looks too short, skipping.'));
      continue;
    }

    saveKey(keyDef.name, value);
    console.log(chalk.green(`✓ ${keyDef.label} saved securely`));
  }

  console.log(chalk.green(`\n✓ ${name} plugin ready!`));
  console.log(`Start with: ${chalk.cyan(`figma-cli ${entry.commands[0]}`)}\n`);
}

// ─── List ───

export function listPlugins() {
  console.log(chalk.bold('\nAvailable Plugins:\n'));
  for (const entry of REGISTRY) {
    const installed = isInstalled(entry.name);
    const hasKey = (entry.requiredKeys || []).every((k) => getKey(k.name));
    let status;
    if (!installed) {
      status = chalk.gray('not installed');
    } else if (!hasKey) {
      status = chalk.yellow('needs setup');
    } else {
      status = chalk.green('ready');
    }
    console.log(`  ${chalk.bold(entry.name.padEnd(12))} ${entry.description.padEnd(44)} ${status}`);
  }

  console.log(chalk.gray(`\nInstall:  figma-cli plugins install <name>`));
  console.log(chalk.gray(`Setup:    figma-cli plugins setup <name>  (in a regular Terminal, not AI chat)`));
  console.log(chalk.gray(`Remove:   figma-cli plugins uninstall <name>\n`));
}

// ─── Plugin Loader ───
// Called from index.js to register plugin commands with Commander

export function loadPlugins(program, { daemonExec, checkConnection, getDaemonToken }) {
  const plugins = getInstalledPlugins();
  for (const plugin of plugins) {
    const pluginDir = plugin.path;
    const entry = REGISTRY.find((p) => p.name === plugin.name);

    // Check required keys
    const missingKeys = (entry?.requiredKeys || []).filter((k) => !getKey(k.name));

    for (const cmd of plugin.commands || []) {
      program
        .command(cmd === plugin.commands[0] ? cmd : `${cmd} [args...]`)
        .description(plugin.commandDescriptions?.[cmd] || `${plugin.name} plugin: ${cmd}`)
        .allowUnknownOption(true)
        .action(async (...args) => {
          if (missingKeys.length > 0) {
            console.log(chalk.yellow(`\n  Plugin "${plugin.name}" needs an API key first.\n`));
            console.log(`  1. Open a NEW Terminal window (Cmd+Space → "Terminal" → Enter)`);
            console.log(`  2. Run: ${chalk.cyan(`figma-cli plugins setup ${plugin.name}`)}`);
            console.log(`  3. Come back here and try again\n`);
            console.log(chalk.gray(`  (separate window keeps your key private)\n`));
            return;
          }

          // Load and run the plugin command
          try {
            const mod = await import(join(pluginDir, plugin.entry || 'index.js'));
            if (mod.commands?.[cmd]) {
              await mod.commands[cmd]({
                args: args.slice(0, -1), // last arg is Commander's Command object
                getKey,
                daemonExec,
                checkConnection,
                getDaemonToken,
                pluginDir,
              });
            }
          } catch (err) {
            console.log(chalk.red(`Plugin error: ${err.message}`));
          }
        });
    }
  }
}

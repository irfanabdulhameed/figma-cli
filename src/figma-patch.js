/**
 * Figma Patch
 *
 * Patches Figma Desktop to enable remote debugging.
 * Newer Figma versions block --remote-debugging-port by default.
 */

import { readFileSync, writeFileSync, accessSync, constants, existsSync, mkdirSync, copyFileSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import {
  getAsarPath as platformGetAsarPath,
  getFigmaBinaryPath as platformGetFigmaBinaryPath,
  getFigmaCommand as platformGetFigmaCommand
} from './platform.js';

// Fixed CDP port (figma-use has 9222 hardcoded)
const CDP_PORT = 9222;

/**
 * Get the CDP port (always 9222 for figma-use compatibility)
 */
export function getCdpPort() {
  return CDP_PORT;
}

// The string that blocks remote debugging
const BLOCK_STRING = Buffer.from('removeSwitch("remote-debugging-port")');
// The patched string (changes "port" to "Xort" to disable the block)
const PATCH_STRING = Buffer.from('removeSwitch("remote-debugXing-port")');

// --- Dock-launch debug patch (always-on CDP) ---
//
// The classic patch above only stops Figma from STRIPPING the debug switch —
// the switch still has to be passed at launch, so Dock/Finder launches come
// up without CDP and the CLI has to kill+restart Figma to attach. This patch
// goes one step further: it rewrites Figma's strip-statement into one that
// APPENDS --remote-debugging-port=9222 in the main process, so EVERY launch
// is debuggable and a restart is never needed.
//
// It is a same-length byte replacement (padded with spaces), so the asar
// header offsets stay valid — no repack, and ElectronAsarIntegrity (which
// only covers default_app.asar anyway) is unaffected.
//
// Factory statement (the minified bundle alias before ".app" varies by build):
//   process.env.FIGMA_TEST||It.app.commandLine.removeSwitch("remote-debugging-port")
// Patched to (space-padded to identical length):
//   It.app.commandLine.appendSwitch("remote-debugging-port","9222")
const DOCK_SITE_RE = /process\.env\.FIGMA_TEST\|\|([A-Za-z_$][A-Za-z0-9_$]*)\.app\.commandLine\.removeSwitch\("remote-debug[gX]ing-port"\)/;
const DOCK_PATCHED_RE = /([A-Za-z_$][A-Za-z0-9_$]*)\.app\.commandLine\.appendSwitch\("remote-debugging-port","9222"\) */;

function buildDockStatement(alias, targetLen) {
  const stmt = `${alias}.app.commandLine.appendSwitch("remote-debugging-port","9222")`;
  if (stmt.length > targetLen) return null; // absurdly long alias — refuse
  return stmt + ' '.repeat(targetLen - stmt.length);
}

/**
 * Get the path to Figma's app.asar file
 */
export function getAsarPath() {
  return platformGetAsarPath();
}

/**
 * Check if Figma is patched
 * @returns {boolean|null} true=patched, false=not patched, null=can't determine
 */
export function isPatched() {
  const asarPath = getAsarPath();
  if (!asarPath) return null;

  try {
    const content = readFileSync(asarPath);

    if (content.includes(PATCH_STRING)) {
      return true; // Already patched
    }

    if (content.includes(BLOCK_STRING)) {
      return false; // Needs patching
    }

    // Dock patch replaces the whole statement, so neither marker exists —
    // but debugging is enabled on every launch, which counts as patched.
    if (DOCK_PATCHED_RE.test(content.toString('latin1'))) {
      return true;
    }

    return null; // Can't determine (maybe old Figma version)
  } catch {
    return null;
  }
}

/**
 * Check if the dock-launch (always-on CDP) patch is applied
 * @returns {boolean|null} true=applied, false=not applied but possible, null=site not found
 */
export function isDockPatched() {
  const asarPath = getAsarPath();
  if (!asarPath) return null;

  try {
    const content = readFileSync(asarPath).toString('latin1');
    if (DOCK_PATCHED_RE.test(content)) return true;
    if (DOCK_SITE_RE.test(content)) return false;
    return null; // Statement not found — incompatible Figma build
  } catch {
    return null;
  }
}

/**
 * Rewrite Figma's strip-statement so every launch enables CDP on port 9222.
 * Safe: same-length replacement, one-time app.asar backup, re-sign after.
 * @returns {boolean} true if applied (or already applied)
 */
export function patchDockDebug() {
  const asarPath = getAsarPath();
  if (!asarPath) {
    throw new Error('Cannot detect Figma installation path for this platform');
  }
  if (!canPatchFigma()) {
    throw new Error('No write access to Figma app files');
  }

  const raw = readFileSync(asarPath);
  const content = raw.toString('latin1');

  if (DOCK_PATCHED_RE.test(content)) return true; // Already applied

  const m = content.match(DOCK_SITE_RE);
  if (!m) {
    throw new Error('Debug-switch statement not found — Figma version may be incompatible');
  }

  const replacement = buildDockStatement(m[1], m[0].length);
  if (!replacement || replacement.length !== m[0].length) {
    throw new Error('Could not build same-length replacement — aborting to keep asar intact');
  }

  // One-time backup of the factory asar for this Figma version
  try {
    const backupDir = join(homedir(), '.figma-ds-cli');
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    const backupPath = join(backupDir, `app.asar.backup`);
    if (!existsSync(backupPath)) copyFileSync(asarPath, backupPath);
  } catch {
    // Backup is belt-and-braces; the unpatch path restores bytes directly.
  }

  const patched = Buffer.from(
    content.slice(0, m.index) + replacement + content.slice(m.index + m[0].length),
    'latin1'
  );
  if (patched.length !== raw.length) {
    throw new Error('Length changed during patch — aborting write');
  }
  writeFileSync(asarPath, patched);

  if (process.platform === 'darwin') {
    try {
      execSync('codesign --force --deep --sign - /Applications/Figma.app', { stdio: 'ignore' });
    } catch {}
  }

  return true;
}

/**
 * Revert the dock-launch patch back to Figma's factory statement.
 * @returns {boolean} true if reverted (or nothing to revert)
 */
export function unpatchDockDebug() {
  const asarPath = getAsarPath();
  if (!asarPath) {
    throw new Error('Cannot detect Figma installation path for this platform');
  }

  const raw = readFileSync(asarPath);
  const content = raw.toString('latin1');

  const m = content.match(DOCK_PATCHED_RE);
  if (!m) return true; // Not dock-patched

  const original = `process.env.FIGMA_TEST||${m[1]}.app.commandLine.removeSwitch("remote-debugging-port")`;
  if (original.length !== m[0].length) {
    throw new Error('Cannot restore factory statement with matching length');
  }

  const restored = Buffer.from(
    content.slice(0, m.index) + original + content.slice(m.index + m[0].length),
    'latin1'
  );
  if (restored.length !== raw.length) {
    throw new Error('Length changed during unpatch — aborting write');
  }
  writeFileSync(asarPath, restored);

  if (process.platform === 'darwin') {
    try {
      execSync('codesign --force --deep --sign - /Applications/Figma.app', { stdio: 'ignore' });
    } catch {}
  }

  return true;
}

/**
 * Check if we have write access to the Figma app.asar file
 * @returns {boolean} true if we can write, false otherwise
 */
export function canPatchFigma() {
  const asarPath = getAsarPath();
  if (!asarPath) return false;

  try {
    accessSync(asarPath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Patch Figma to enable remote debugging
 * @returns {boolean} true if patched successfully
 */
export function patchFigma() {
  const asarPath = getAsarPath();
  if (!asarPath) {
    throw new Error('Cannot detect Figma installation path for this platform');
  }

  // Check write access first
  if (!canPatchFigma()) {
    if (process.platform === 'darwin') {
      throw new Error('No write access to Figma. On macOS 13+ grant your terminal "App Management" (System Settings → Privacy & Security → App Management) — "Full Disk Access" alone does not allow modifying another app. Or use Safe Mode: figma-cli connect --safe');
    } else {
      throw new Error('No write access to Figma. Try running as administrator.');
    }
  }

  const content = readFileSync(asarPath);
  const blockIndex = content.indexOf(BLOCK_STRING);

  if (blockIndex < 0) {
    // Check if already patched
    if (content.includes(PATCH_STRING)) {
      return true; // Already patched
    }
    throw new Error('Could not find the string to patch. Figma version may be incompatible.');
  }

  // Apply patch
  PATCH_STRING.copy(content, blockIndex);
  writeFileSync(asarPath, content);

  // On macOS, re-sign the app
  if (process.platform === 'darwin') {
    try {
      execSync('codesign --force --deep --sign - /Applications/Figma.app', { stdio: 'ignore' });
    } catch {
      // Codesign might fail but patch might still work
    }
  }

  return true;
}

/**
 * Unpatch Figma to restore original state (re-enables remote debugging block)
 * @returns {boolean} true if unpatched successfully
 */
export function unpatchFigma() {
  const asarPath = getAsarPath();
  if (!asarPath) {
    throw new Error('Cannot detect Figma installation path for this platform');
  }

  // The dock-debug patch replaces the whole statement (no PATCH_STRING left);
  // revert it first so the factory string is back before the check below.
  try { unpatchDockDebug(); } catch {}

  const content = readFileSync(asarPath);
  const patchIndex = content.indexOf(PATCH_STRING);

  if (patchIndex < 0) {
    // Check if already unpatched (original state)
    if (content.includes(BLOCK_STRING)) {
      return true; // Already in original state
    }
    throw new Error('Could not find the patched string. Figma may not have been patched by this tool.');
  }

  // Restore original
  BLOCK_STRING.copy(content, patchIndex);
  writeFileSync(asarPath, content);

  // On macOS, re-sign the app
  if (process.platform === 'darwin') {
    try {
      execSync('codesign --force --deep --sign - /Applications/Figma.app', { stdio: 'ignore' });
    } catch {
      // Codesign might fail but unpatch might still work
    }
  }

  return true;
}

/**
 * Get the command to start Figma with remote debugging
 */
export function getFigmaCommand(port = 9222) {
  return platformGetFigmaCommand(port);
}

/**
 * Get the path to Figma binary
 */
export function getFigmaBinaryPath() {
  return platformGetFigmaBinaryPath();
}

export default {
  getAsarPath,
  isPatched,
  isDockPatched,
  canPatchFigma,
  patchFigma,
  patchDockDebug,
  unpatchFigma,
  unpatchDockDebug,
  getFigmaCommand,
  getFigmaBinaryPath,
  getCdpPort
};

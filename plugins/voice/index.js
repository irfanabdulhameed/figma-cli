/**
 * fig-agent voice plugin entry point.
 * Exports command handlers for figma-cli's plugin system.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { existsSync, unlinkSync, realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { buildSystemPrompt } from './prompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS = JSON.parse(
  readFileSync(resolve(__dirname, 'tools/figma-tools.json'), 'utf-8')
);

const MODEL = process.env.FIG_AGENT_MODEL || 'claude-sonnet-4-5';
const VOICE_NAME = process.env.FIG_AGENT_VOICE || 'Samantha';

// ─── Anthropic API ───

const SYSTEM_PROMPT = buildSystemPrompt();

// Stream Anthropic response. Calls onText(chunk) as text arrives,
// returns full response object when done.
async function callAnthropicStreaming(messages, apiKey, { onText } = {}) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);

  const content = [];
  let currentBlock = null;
  let stopReason = null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      let event;
      try { event = JSON.parse(data); } catch { continue; }

      switch (event.type) {
        case 'content_block_start':
          currentBlock = { ...event.content_block, _index: event.index };
          if (currentBlock.type === 'text') currentBlock.text = '';
          if (currentBlock.type === 'tool_use') currentBlock.input = '';
          break;

        case 'content_block_delta':
          if (!currentBlock) break;
          if (event.delta.type === 'text_delta') {
            currentBlock.text += event.delta.text;
            if (onText) onText(event.delta.text);
          } else if (event.delta.type === 'input_json_delta') {
            currentBlock.input += event.delta.partial_json;
          }
          break;

        case 'content_block_stop':
          if (currentBlock) {
            if (currentBlock.type === 'tool_use') {
              try { currentBlock.input = JSON.parse(currentBlock.input); } catch { currentBlock.input = {}; }
            }
            delete currentBlock._index;
            content.push(currentBlock);
            currentBlock = null;
          }
          break;

        case 'message_delta':
          stopReason = event.delta?.stop_reason || stopReason;
          break;
      }
    }
  }

  return { content, stop_reason: stopReason };
}

// ─── Bridge (talks directly to figma-cli daemon for speed) ───

const DAEMON_PORT = 3456;
const DAEMON_TOKEN_FILE = resolve(homedir(), '.figma-ds-cli', '.daemon-token');

function getDaemonToken() {
  try { return readFileSync(DAEMON_TOKEN_FILE, 'utf-8').trim(); }
  catch { return null; }
}

async function daemonExec(action, data = {}, timeout = 60000) {
  const token = getDaemonToken();
  const headers = { 'content-type': 'application/json' };
  if (token) headers['X-Daemon-Token'] = token;

  const res = await fetch(`http://localhost:${DAEMON_PORT}/exec`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...data }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err };
  }
  const result = await res.json();
  return { ok: true, stdout: typeof result === 'string' ? result : JSON.stringify(result), stderr: '' };
}

// Fallback: spawn figma-cli as subprocess (for commands not supported by daemon)
function runFigmaCliFallback(args, { timeout = 60000 } = {}) {
  return new Promise((resolveP, rejectP) => {
    const realScript = realpathSync(process.argv[1]);
    const figmaCliDir = resolve(dirname(realScript), '..');
    const child = spawn(process.argv[0], [realScript, ...args], {
      env: { ...process.env },
      cwd: figmaCliDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectP(new Error(`timeout after ${timeout}ms`));
    }, timeout);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ ok: code === 0, code, stdout, stderr });
    });
    child.on('error', (err) => { clearTimeout(timer); rejectP(err); });
  });
}

const toolHandlers = {
  // render uses daemon's own render action (fast, no subprocess)
  async figma_render({ jsx }) { return daemonExec('render', { jsx }); },

  // eval goes directly to daemon (instant, no Node.js boot)
  async figma_eval({ code }) { return daemonExec('eval', { code }); },

  // verify needs the CLI (daemon doesn't have verify endpoint)
  async figma_verify({ node_id } = {}) { return runFigmaCliFallback(node_id ? ['verify', node_id] : ['verify']); },

  async figma_blocks_create({ block }) { return runFigmaCliFallback(['blocks', 'create', block]); },
  async figma_blocks_list() { return runFigmaCliFallback(['blocks', 'list']); },

  async figma_tokens({ preset }) {
    if (preset === 'shadcn') return runFigmaCliFallback(['tokens', 'preset', 'shadcn']);
    if (preset === 'tailwind') return runFigmaCliFallback(['tokens', 'tailwind']);
    if (preset === 'ds') return runFigmaCliFallback(['tokens', 'ds']);
    throw new Error(`Unknown preset: ${preset}`);
  },

  async figma_a11y_audit({ node_id }) { return runFigmaCliFallback(node_id ? ['a11y', 'audit', node_id] : ['a11y', 'audit'], { timeout: 120000 }); },

  // Selection + component list: direct eval via daemon (fast)
  async figma_get_selection() {
    return daemonExec('eval', { code: `(() => {
      const sel = figma.currentPage.selection;
      return sel.map(n => ({ id: n.id, name: n.name, type: n.type, x: n.x, y: n.y, width: n.width, height: n.height }));
    })()` });
  },

  async figma_component_list() { return runFigmaCliFallback(['component', 'list']); },

  async figma_gradient_extract({ image_path, mode, apply_to, direction, stops, blur }) {
    const args = ['gradient', 'extract', image_path];
    if (mode) args.push('--mode', mode);
    if (apply_to) args.push('--apply-to', apply_to);
    if (direction) args.push('--direction', direction);
    if (stops) args.push('--stops', String(stops));
    if (blur != null) args.push('--blur', String(blur));
    args.push('--json');
    return runFigmaCliFallback(args, { timeout: 60000 });
  },

  async figma_gradient_mesh({ colors, style, seed, apply_to, size, base, blur, name }) {
    const args = ['gradient', 'mesh', colors];
    if (style) args.push('--style', style);
    if (seed != null) args.push('--seed', String(seed));
    if (apply_to) args.push('--apply-to', apply_to);
    if (size) args.push('--size', size);
    if (base) args.push('--base', base);
    if (blur != null) args.push('--blur', String(blur));
    if (name) args.push('--name', name);
    args.push('--json');
    return runFigmaCliFallback(args, { timeout: 60000 });
  },
};

async function dispatchTool(name, input) {
  const handler = toolHandlers[name];
  if (!handler) return { ok: false, error: `Unknown tool: ${name}` };
  try { return await handler(input || {}); }
  catch (err) { return { ok: false, error: err.message }; }
}

// ─── Tool-use loop ───

async function toolLoop(userInput, history, apiKey) {
  history.push({ role: 'user', content: userInput });
  for (let turn = 0; turn < 20; turn++) {
    let streamedText = '';
    const response = await callAnthropicStreaming(history, apiKey, {
      onText: (chunk) => {
        streamedText += chunk;
        process.stderr.write(chunk);
      },
    });
    if (streamedText) process.stderr.write('\n');

    history.push({ role: 'assistant', content: response.content });
    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    const texts = response.content.filter((b) => b.type === 'text');

    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      return texts.map((t) => t.text).join('\n').trim();
    }

    // Execute tool calls in parallel
    process.stderr.write(`  → ${toolUses.map(u => u.name).join(', ')}\n`);
    const toolResults = await Promise.all(toolUses.map(async (use) => {
      let result;
      try { result = await dispatchTool(use.name, use.input); }
      catch (err) { result = { ok: false, error: err.message }; }
      return {
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(result),
        is_error: !result.ok,
      };
    }));
    history.push({ role: 'user', content: toolResults });
  }
  return 'Tool loop exceeded 10 turns.';
}

// ─── Audio device detection ───

function listAudioDevices() {
  try {
    // ffmpeg always exits non-zero here, so we capture stderr via shell redirect
    const output = execSync('ffmpeg -f avfoundation -list_devices true -i "" 2>&1 || true', { encoding: 'utf-8', shell: true });
    const devices = [];
    let inAudio = false;
    for (const line of output.split('\n')) {
      if (line.includes('AVFoundation audio devices')) { inAudio = true; continue; }
      if (inAudio) {
        const m = line.match(/\[(\d+)\] (.+)/);
        if (m) devices.push({ index: m[1], name: m[2].trim() });
      }
    }
    return devices;
  } catch { return []; }
}

function checkAudioLevel(deviceIndex, seconds = 2) {
  return new Promise((res) => {
    const testPath = resolve(tmpdir(), `fig-mic-test-${Date.now()}.wav`);
    const ff = spawn('ffmpeg', [
      '-f', 'avfoundation', '-i', `:${deviceIndex}`,
      '-ac', '1', '-ar', '16000', '-y', '-t', String(seconds), '-loglevel', 'error',
      testPath,
    ]);
    ff.on('close', () => {
      if (!existsSync(testPath)) { res(-999); return; }
      const probe = spawn('ffmpeg', ['-i', testPath, '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      probe.stderr.on('data', (d) => { stderr += d.toString(); });
      probe.on('close', () => {
        try { unlinkSync(testPath); } catch {}
        const m = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
        res(m ? parseFloat(m[1]) : -999);
      });
    });
  });
}

// ─── Recording + Transcription ───

let activeDeviceIndex = '0';

function startRecording(outPath) {
  const ff = spawn('ffmpeg', [
    '-f', 'avfoundation', '-i', `:${activeDeviceIndex}`,
    '-ac', '1', '-ar', '16000', '-y', '-loglevel', 'error',
    outPath,
  ]);
  const done = new Promise((res) => ff.on('close', () => res()));
  return { stop: () => { ff.kill('SIGINT'); return done; } };
}

function transcribe(audioPath) {
  return new Promise((res, rej) => {
    const outDir = tmpdir();
    const mlx = spawn('mlx_whisper', [
      '--model', process.env.FIG_AGENT_WHISPER_MODEL || 'mlx-community/whisper-small-mlx',
      '--output-format', 'txt',
      '--output-dir', outDir,
      audioPath,
    ]);
    let stderr = '';
    mlx.stderr.on('data', (d) => { stderr += d.toString(); });
    mlx.on('close', (code) => {
      if (code !== 0) return rej(new Error(`mlx_whisper: ${stderr}`));
      const base = audioPath.split('/').pop().replace(/\.[^.]+$/, '');
      const txtPath = resolve(outDir, base + '.txt');
      if (!existsSync(txtPath)) return rej(new Error('transcription missing'));
      const text = readFileSync(txtPath, 'utf-8').trim();
      try { unlinkSync(txtPath); } catch {}
      res(text);
    });
  });
}

function speak(text) {
  return new Promise((r) => {
    const p = spawn('say', ['-v', VOICE_NAME, text]);
    p.on('close', r);
  });
}

// ─── Exported commands (called by figma-cli plugin loader) ───

export const commands = {
  async voice({ getKey }) {
    const apiKey = getKey('ANTHROPIC_API_KEY');
    if (!apiKey) {
      console.log('\n  API key not found. Run in a regular Terminal:\n  figma-cli plugins setup voice\n');
      return;
    }

    // ─── Mic check ───
    console.log('\n🎙  fig-agent voice mode\n');

    const devices = listAudioDevices();
    if (devices.length === 0) {
      console.log('   ✗ No audio devices found. Is ffmpeg installed?\n');
      return;
    }

    // Show device picker
    console.log('   Available microphones:\n');
    for (const dev of devices) {
      console.log(`     [${dev.index}] ${dev.name}`);
    }
    console.log('');

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const chosen = await new Promise((r) => rl.question(`   Which mic? (0-${devices.length - 1}, Enter for 0): `, r));
    const chosenIndex = chosen.trim() || '0';
    const chosenDev = devices.find((d) => d.index === chosenIndex);

    if (!chosenDev) {
      console.log(`   ✗ Invalid device: ${chosenIndex}\n`);
      rl.close();
      return;
    }

    activeDeviceIndex = chosenIndex;
    console.log(`   ✓ Using: ${chosenDev.name}\n`);

    // Quick mic test
    process.stdout.write('   Testing mic (speak briefly)... ');
    const level = await checkAudioLevel(chosenIndex, 2);
    if (level < -80) {
      console.log('⚠ silent');
      console.log('\n   Mic seems silent. Common fixes:');
      console.log('   - Make sure you are NOT inside tmux/screen');
      console.log('   - Check System Settings → Sound → Input');
      console.log('   - Check System Settings → Privacy → Microphone\n');
      const cont = await new Promise((r) => rl.question('   Continue anyway? (y/N): ', r));
      if (cont.toLowerCase() !== 'y') { rl.close(); return; }
    } else {
      console.log(`OK (${level.toFixed(0)} dB)`);
    }

    console.log('\n   Press Enter to start/stop recording. Ctrl+C to quit.\n');

    const history = [];

    while (true) {
      await new Promise((r) => rl.question('Press Enter to speak… ', r));
      const audioPath = resolve(tmpdir(), `fig-voice-${Date.now()}.wav`);
      const rec = startRecording(audioPath);
      process.stdout.write('🔴 Recording… press Enter to stop ');
      await new Promise((r) => rl.question('', r));
      await rec.stop();
      console.log('⏳ transcribing…');

      let userText;
      try {
        userText = await transcribe(audioPath);
      } catch (err) {
        console.error('Transcription failed:', err.message);
        continue;
      } finally {
        try { unlinkSync(audioPath); } catch {}
      }

      if (!userText) { console.log('(nothing heard)'); continue; }
      console.log('you:', userText);

      let answer;
      try { answer = await toolLoop(userText, history, apiKey); }
      catch (err) { console.error('error:', err.message); continue; }

      if (answer) {
        console.log('fig-agent:', answer);
        await speak(answer);
      }
    }
  },

  async chat({ args, getKey }) {
    const apiKey = getKey('ANTHROPIC_API_KEY');
    if (!apiKey) {
      console.log('\n  API key not found. Run in a regular Terminal:\n  figma-cli plugins setup voice\n');
      return;
    }

    const userMessage = args.join(' ');
    if (!userMessage) {
      console.log('Usage: figma-cli chat "your request"');
      return;
    }

    const history = [];
    const answer = await toolLoop(userMessage, history, apiKey);
    if (answer) {
      console.log('\n' + answer + '\n');
    }
  },
};

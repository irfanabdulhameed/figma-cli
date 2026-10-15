// Per-file memory: one markdown "hub" note per Figma file, so any agent
// session can answer "what did we do on file X" by reading one note, and
// every session leaves a dated line in that note after it works on the file.
//
// Pure functions only (no Figma, no daemon) so they are unit-testable; the
// `memory` command in commands/memory.js feeds them the connected file name.
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

export const HUB_PREFIX = 'file-';
export const INDEX_START = '<!-- figma-files:start -->';
export const INDEX_END = '<!-- figma-files:end -->';

export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file';

/** Memory folder: --dir beats FIGMA_CLI_MEMORY_DIR beats ./figma-memory. */
export function resolveMemoryDir(explicit) {
  return resolve(explicit || process.env.FIGMA_CLI_MEMORY_DIR || 'figma-memory');
}

/**
 * Figma file names a hub covers. A hub declares them in its frontmatter as
 * `figma_file: "Name"` or `figma_files: ["A", "B"]` (one hub may cover a
 * family of related files).
 */
export function hubFileNames(text) {
  const names = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*figma_files?:\s*(.+)$/);
    if (!m) continue;
    const quoted = [...m[1].matchAll(/"([^"]+)"/g)].map(q => q[1]);
    names.push(...(quoted.length ? quoted : [m[1].trim()]));
  }
  return names;
}

/** Find the hub for a file: declared name first, then the slug filename. */
export function findHub(dir, fileName) {
  if (!existsSync(dir)) return null;
  const hubs = readdirSync(dir).filter(f => f.startsWith(HUB_PREFIX) && f.endsWith('.md'));
  const want = fileName.trim().toLowerCase();
  for (const f of hubs) {
    const text = readFileSync(join(dir, f), 'utf8');
    if (hubFileNames(text).some(n => n.toLowerCase() === want)) return join(dir, f);
  }
  const bySlug = `${HUB_PREFIX}${slugify(fileName)}.md`;
  return hubs.includes(bySlug) ? join(dir, bySlug) : null;
}

export function newHubText(fileName) {
  return [
    '---',
    `name: ${HUB_PREFIX}${slugify(fileName)}`,
    `description: "Hub for Figma file \\"${fileName.replace(/"/g, '\\"')}\\": pages, what was done there and when, links to detailed notes."`,
    'metadata:',
    '  type: project',
    `  figma_file: "${fileName.replace(/"/g, '\\"')}"`,
    '---',
    '',
    `# Figma file: ${fileName}`,
    '',
    '## Pages',
    '',
    '## Timeline (newest first)',
    '',
  ].join('\n');
}

const isHeading = (l) => /^#{1,6}\s/.test(l);

/** Index of the first line of a `## <prefix>…` section, or -1. */
function sectionStart(lines, prefix) {
  const re = new RegExp(`^##\\s+${prefix}`, 'i');
  return lines.findIndex(l => re.test(l));
}

/** Insert a dated line at the top of the Timeline section (newest first). */
export function addTimelineEntry(text, entry) {
  const lines = text.split('\n');
  let at = sectionStart(lines, 'Timeline');
  if (at < 0) {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push('', '## Timeline (newest first)', '');
    at = lines.length - 2;
  }
  // Skip the heading and any blank lines right under it.
  let i = at + 1;
  while (i < lines.length && lines[i].trim() === '') i++;
  const line = `- ${entry}`;
  if (i >= lines.length || isHeading(lines[i])) lines.splice(at + 1, i - at - 1, '', line, '');
  else lines.splice(i, 0, line);
  return lines.join('\n');
}

/**
 * Record a page in the Pages section unless the hub already mentions its id
 * (hubs may keep pages as a table or a list; any mention counts).
 */
export function addPage(text, page) {
  if (!page || !page.id || text.includes(page.id)) return text;
  const lines = text.split('\n');
  let at = sectionStart(lines, 'Pages');
  const line = `- ${page.name} (${page.id})`;
  if (at < 0) {
    const tl = sectionStart(lines, 'Timeline');
    const block = ['## Pages', '', line, ''];
    if (tl < 0) lines.push('', ...block);
    else lines.splice(tl, 0, ...block);
    return lines.join('\n');
  }
  // End of the section = next heading; back up over trailing blank lines.
  let end = at + 1;
  while (end < lines.length && !isHeading(lines[end])) end++;
  let last = end;
  while (last > at + 1 && lines[last - 1].trim() === '') last--;
  const prev = lines[last - 1] || '';
  // A list line can't continue a markdown table: leave a blank line after one.
  const insert = prev.trim().startsWith('|') ? ['', line] : [line];
  if (last === at + 1) insert.unshift('');
  lines.splice(last, 0, ...insert);
  return lines.join('\n');
}

/**
 * Keep a managed "Figma files" list in the index between the two markers;
 * creates the block (and the index) when missing. Lines outside are untouched.
 */
export function updateIndex(indexText, hubs) {
  const body = hubs
    .slice()
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .map(h => `- [${h.fileName}](${h.hub}) — ${h.last || 'no entries yet'}`);
  const block = [INDEX_START, ...body, INDEX_END].join('\n');
  const s = indexText.indexOf(INDEX_START);
  const e = indexText.indexOf(INDEX_END);
  if (s >= 0 && e > s) return indexText.slice(0, s) + block + indexText.slice(e + INDEX_END.length);
  const head = indexText.trim() ? indexText.replace(/\s*$/, '\n\n') : '# Memory Index\n\n';
  return `${head}## Figma files (one hub per file)\n${block}\n`;
}

/** Newest timeline line of a hub, for the index and `memory list`. */
export function latestEntry(text) {
  const lines = text.split('\n');
  const at = sectionStart(lines, 'Timeline');
  if (at < 0) return null;
  for (let i = at + 1; i < lines.length && !isHeading(lines[i]); i++) {
    if (lines[i].startsWith('- ')) return lines[i].slice(2).trim();
  }
  return null;
}

export function listHubs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.startsWith(HUB_PREFIX) && f.endsWith('.md'))
    .map(f => {
      const text = readFileSync(join(dir, f), 'utf8');
      const names = hubFileNames(text);
      const title = (text.match(/^#\s+(?:Figma files?:\s*)?(.+)$/m) || [])[1];
      return { hub: f, fileName: names.join(', ') || title || f, last: latestEntry(text) };
    });
}

export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Append one dated entry for `fileName` (creating its hub if needed), record
 * the page, refresh the index. Returns { hub, created }.
 */
export function logEntry({ dir, fileName, page, text, date = today(), index = 'MEMORY.md' }) {
  mkdirSync(dir, { recursive: true });
  let hub = findHub(dir, fileName);
  const created = !hub;
  if (!hub) hub = join(dir, `${HUB_PREFIX}${slugify(fileName)}.md`);
  let body = created ? newHubText(fileName) : readFileSync(hub, 'utf8');
  body = addPage(body, page);
  const where = page && page.name ? `[${page.name}] ` : '';
  body = addTimelineEntry(body, `${date}: ${where}${text}`);
  writeFileSync(hub, body);
  const indexPath = join(dir, index);
  const indexText = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  writeFileSync(indexPath, updateIndex(indexText, listHubs(dir)));
  return { hub, created };
}

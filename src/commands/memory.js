// Command: memory — per-Figma-file memory notes for agent sessions.
// `memory log` stamps a dated line into the connected file's hub note,
// `memory show` prints it, `memory list` lists every hub. See docs/MEMORY.md.
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { program, checkConnection, fastEval, resolvePageScope } from '../lib/cli-core.js';
import { resolveMemoryDir, findHub, listHubs, logEntry } from '../lib/file-memory.js';

const asValue = (r) => {
  if (typeof r !== 'string') return r;
  try { return JSON.parse(r); } catch { return r; }
};

/** Connected file name + page (the scoped page when one is set). */
async function connectedFile(pageId) {
  await checkConnection();
  const code = `(async () => {
    const id = ${JSON.stringify(pageId || '')};
    const p = id ? await figma.getNodeByIdAsync(id) : figma.currentPage;
    return JSON.stringify({ file: figma.root.name, page: p ? { id: p.id, name: p.name } : null });
  })()`;
  return asValue(await fastEval(code));
}

const memory = program
  .command('memory')
  .description('Per-file memory: one hub note per Figma file (see docs/MEMORY.md)');

memory
  .command('log <text...>')
  .description('Add a dated line to the connected file\'s hub (creates it if new)')
  .option('--dir <path>', 'Memory folder (default: $FIGMA_CLI_MEMORY_DIR or ./figma-memory)')
  .option('--file <name>', 'Figma file name (skip the live lookup)')
  .option('--skip-page', 'Do not record the page')
  .option('--index <name>', 'Index file inside the memory folder', 'MEMORY.md')
  .action(async (words, options) => {
    const dir = resolveMemoryDir(options.dir);
    let fileName = options.file;
    let page = null;
    if (!fileName || !options.skipPage) {
      // --page / FIGMA_CLI_PAGE: record the scoped page, not whatever is open.
      const live = await connectedFile(resolvePageScope(options));
      fileName = fileName || live.file;
      if (!options.skipPage) page = live.page;
    }
    const { hub, created } = logEntry({
      dir, fileName, page, text: words.join(' '), index: options.index,
    });
    console.log(chalk.green(`${created ? 'Created' : 'Updated'} ${hub}`));
  });

memory
  .command('show [file]')
  .description('Print the hub for a file (default: the connected file)')
  .option('--dir <path>', 'Memory folder (default: $FIGMA_CLI_MEMORY_DIR or ./figma-memory)')
  .action(async (file, options) => {
    const dir = resolveMemoryDir(options.dir);
    const fileName = file || (await connectedFile(null)).file;
    const hub = findHub(dir, fileName);
    if (!hub || !existsSync(hub)) {
      console.log(chalk.yellow(`No memory yet for "${fileName}" in ${dir}.`));
      return;
    }
    console.log(readFileSync(hub, 'utf8'));
  });

memory
  .command('list')
  .description('List every file hub with its newest entry')
  .option('--dir <path>', 'Memory folder (default: $FIGMA_CLI_MEMORY_DIR or ./figma-memory)')
  .action((options) => {
    const hubs = listHubs(resolveMemoryDir(options.dir));
    if (!hubs.length) {
      console.log(chalk.yellow('No file hubs yet. Run `memory log "<what you did>"` after a task.'));
      return;
    }
    for (const h of hubs) console.log(`${chalk.cyan(h.fileName)}  ${chalk.gray(h.hub)}\n  ${h.last || '-'}`);
  });

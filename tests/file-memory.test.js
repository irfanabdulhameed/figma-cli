import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  slugify, hubFileNames, findHub, addTimelineEntry, addPage,
  updateIndex, latestEntry, listHubs, logEntry, INDEX_START, INDEX_END,
} from '../src/lib/file-memory.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'fmem-'));

test('slugify makes file names safe', () => {
  assert.equal(slugify('My Design System 2.0'), 'my-design-system-2-0');
  assert.equal(slugify('***'), 'file');
});

test('hubFileNames reads single and list forms', () => {
  assert.deepEqual(hubFileNames('  figma_file: "Web App"'), ['Web App']);
  assert.deepEqual(hubFileNames('figma_files: ["App hi-fi", "App wireframes"]'), ['App hi-fi', 'App wireframes']);
});

test('logEntry creates a hub, then appends newest first', () => {
  const dir = tmp();
  const a = logEntry({ dir, fileName: 'Web App', page: { id: '1:2', name: 'Home' }, text: 'built hero', date: '2026-01-01' });
  assert.equal(a.created, true);
  const b = logEntry({ dir, fileName: 'web app', page: { id: '1:2', name: 'Home' }, text: 'fixed nav', date: '2026-01-02' });
  assert.equal(b.created, false);
  assert.equal(a.hub, b.hub);
  const text = readFileSync(a.hub, 'utf8');
  assert.ok(text.indexOf('2026-01-02') < text.indexOf('2026-01-01'));
  assert.equal(text.match(/\(1:2\)/g).length, 1, 'page recorded once');
  assert.equal(latestEntry(text), '2026-01-02: [Home] fixed nav');
});

test('findHub matches a declared name even when the filename differs', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'file-family.md'), '---\nmetadata:\n  figma_files: ["Alpha", "Beta"]\n---\n# x\n');
  assert.equal(findHub(dir, 'beta'), join(dir, 'file-family.md'));
  assert.equal(findHub(dir, 'Gamma'), null);
});

test('addTimelineEntry adds the section when missing', () => {
  const out = addTimelineEntry('# Hub\n', '2026-01-01: x');
  assert.match(out, /## Timeline[^\n]*\n\n- 2026-01-01: x/);
});

test('addPage skips known ids and does not join a table', () => {
  const table = '# H\n\n## Pages\n| Page | Id |\n|---|---|\n| Home | 1:2 |\n\n## Timeline\n';
  assert.equal(addPage(table, { id: '1:2', name: 'Home' }), table);
  const out = addPage(table, { id: '3:4', name: 'About' });
  assert.match(out, /\| Home \| 1:2 \|\n\n- About \(3:4\)\n\n## Timeline/);
});

test('updateIndex rewrites only the managed block', () => {
  const start = '# Memory\n\n- [Rule](rule.md) — keep me\n';
  const one = updateIndex(start, [{ fileName: 'B', hub: 'file-b.md', last: 'x' }, { fileName: 'A', hub: 'file-a.md' }]);
  assert.ok(one.includes('keep me'));
  assert.ok(one.indexOf('[A]') < one.indexOf('[B]'));
  const two = updateIndex(one, [{ fileName: 'A', hub: 'file-a.md', last: 'y' }]);
  assert.equal(two.split(INDEX_START).length, 2);
  assert.ok(!two.includes('[B]'));
  assert.ok(two.includes(INDEX_END));
});

test('listHubs reports the newest entry per hub', () => {
  const dir = tmp();
  logEntry({ dir, fileName: 'One', text: 'a', date: '2026-02-01' });
  const hubs = listHubs(dir);
  assert.equal(hubs.length, 1);
  assert.equal(hubs[0].fileName, 'One');
  assert.equal(hubs[0].last, '2026-02-01: a');
  assert.ok(readFileSync(join(dir, 'MEMORY.md'), 'utf8').includes('[One](file-one.md)'));
});

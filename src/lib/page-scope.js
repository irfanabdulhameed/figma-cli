/**
 * Plugin-side code generation for page scoping.
 *
 * Lives in its own module because the daemon needs it too, and the daemon
 * deliberately doesn't import cli-core.js (it runs standalone, hot-reloading
 * FigmaClient from a temp copy).
 *
 * Everything emitted here ends up inside an eval that most call sites flatten
 * to a single line, so: statements only, each semicolon-terminated, no line
 * comments.
 */

// Walk up to the PAGE a node lives on.
export const PAGE_OF_HELPER =
  `const __pageOf = (n) => { let c = n; while (c && c.type !== 'PAGE') c = c.parent; return c; };`;

// Resolve `__scope` / `__scopeId` for a page id, failing loudly on a bad id.
export function pageResolveCode(pageId) {
  return `const __scopeId = ${JSON.stringify(pageId)};
       const __scope = await figma.getNodeByIdAsync(__scopeId);
       if (!__scope || __scope.type !== 'PAGE') throw new Error('page scope ' + __scopeId + ' is not a page in this file');
       if (typeof __scope.loadAsync === 'function') await __scope.loadAsync();`;
}

/**
 * Move `__targets` (nodes already resolved) onto `__scope`, preserving their
 * layout relative to each other by shifting the whole group by one offset into
 * free space on the target page.
 *
 * Idempotent by construction: nodes already parented to the scope page are
 * filtered out before anything is measured or moved, so running this twice
 * over the same render (once in the daemon wrapper, once as a post-render
 * sweep) never double-shifts a frame.
 */
const RELOCATE_BODY = `
  const __moved = __targets.filter(n => n && n.parent && n.parent.id !== __scopeId);
  if (__moved.length > 0) {
    let __maxRight = 0;
    __scope.children.forEach(n => { const r = n.x + (n.width || 0); if (r > __maxRight) __maxRight = r; });
    const __destX = __scope.children.length > 0 ? Math.round(__maxRight + 100) : 0;
    let __minX = Infinity, __minY = Infinity;
    __moved.forEach(n => { __minX = Math.min(__minX, n.x); __minY = Math.min(__minY, n.y); });
    const __dx = __destX - __minX;
    const __dy = 100 - __minY;
    __moved.forEach(n => { n.x = n.x + __dx; n.y = n.y + __dy; });
    __moved.forEach(n => __scope.appendChild(n));
  }`;

/**
 * Make a generated render/render-batch script land on a specific page.
 *
 * The generated code creates frames with `figma.createFrame()`, which appends
 * to the shared `currentPage`. Rather than rewrite the JSX generator, run it
 * as-is and then relocate what it reports. The frames exist on the active page
 * for a few milliseconds first — a flicker in the other agent's viewport,
 * nothing more; they are never left there.
 */
export function wrapRenderForPageScope(code, pageId) {
  if (!pageId) return code;
  return `(async () => {
${pageResolveCode(pageId)}
  const __raw = await (${code});
  const __frames = Array.isArray(__raw) ? __raw : ((__raw && __raw.frames) || []);
  const __targets = [];
  for (const __f of __frames) {
    const __n = __f && __f.id ? await figma.getNodeByIdAsync(__f.id) : null;
    if (__n) __targets.push(__n);
  }
${RELOCATE_BODY}
  return __raw;
})()`;
}

/**
 * Post-hoc relocation for render paths whose creation step we don't control —
 * notably Yolo mode, which shells out to the external `figma-use` binary and
 * only hands back node ids.
 */
export function pageScopeRelocateCode(ids, pageId) {
  return `(async () => {
${pageResolveCode(pageId)}
  const __ids = ${JSON.stringify(ids)};
  const __resolved = await Promise.all(__ids.map(id => figma.getNodeByIdAsync(id)));
  const __targets = __resolved.filter(Boolean);
${RELOCATE_BODY}
  return __moved.length;
})()`;
}

// This package and markupeditor-app are both members of the root npm workspace, so the
// 'markupeditor' specifier resolves to the SAME hoisted copy in the shared root node_modules/
// for both this import and importMarkdown()'s `import { MU } from "markupeditor"` (in
// markupeditor-app/src/markdown.js) -- a single module instance, not two separate installs.
// Consumers of this harness must not vi.mock('markupeditor', ...) -- that would replace this
// same module for their whole reachable graph, including markdown.js's import. (vitest.config.js
// additionally aliases 'markupeditor' to the sibling MarkupEditor checkout's shipped bundle,
// rather than leaving it to resolve to whichever npm package happens to be installed nearby --
// see plugins/README.md's Testing section for why that matters.)
import { MU } from 'markupeditor'
import { importMarkdown } from '../../../../markupeditor-app/src/markdown.js'

/**
 * Render markdown through the app's real importMarkdown() conversion path
 * (frontmatter/leading-HTML-block extraction, parse, DOM serialization),
 * without a live editor view. Requires a DOM global (jsdom, installed by
 * plugin-kit's jsdomShims.js) since importMarkdown() creates a detached div.
 *
 * @param {string} markdown - Raw markdown text.
 * @returns {{ html: string|null, warnings: string[], metadata: string|null }}
 */
export function renderTestDocument(markdown) {
  const originalActiveView = MU.activeView
  MU.activeView = () => ({ state: { schema: MU.schema } })
  try {
    const { result, warnings, metadata } = JSON.parse(importMarkdown(markdown))
    return { html: result, warnings, metadata: metadata ?? null }
  } finally {
    MU.activeView = originalActiveView
  }
}

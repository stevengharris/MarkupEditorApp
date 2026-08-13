// The 'markupeditor' specifier is aliased (vitest.config.js) to
// MarkupEditor/Resources/markup-editor.js -- the exact bundle the real app loads
// at runtime -- rather than resolving to whichever package's own
// node_modules/markupeditor copy happens to be installed nearby, which can drift
// out of sync with what's actually shipped (verified: markupeditor-app's own
// installed copy was two versions behind Resources). The alias applies across the
// whole module graph, so this import and importMarkdown()'s own
// `import { MU } from "markupeditor"` (in markupeditor-app/src/markdown.js)
// resolve to the SAME module instance -- stubbing activeView() below actually
// takes effect on the copy importMarkdown() reads from. Consumers of this harness
// must not vi.mock('markupeditor', ...) -- that would replace this same module
// for their whole reachable graph, including markdown.js's import.
import { MU } from 'markupeditor'
import { importMarkdown } from '../../../../markupeditor-app/src/markdown.js'

/**
 * Render markdown through the app's real importMarkdown() conversion path
 * (frontmatter/leading-HTML-block extraction, parse, DOM serialization),
 * without a live editor view. Requires a DOM global (`@vitest-environment
 * happy-dom` or equivalent) since importMarkdown() creates a detached div.
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

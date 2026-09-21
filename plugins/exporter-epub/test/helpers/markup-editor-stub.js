// Aliased (via vitest.config.js) onto the resolved path of dist/markup-editor.js -- the
// relative specifier rollup's `paths` config rewrites `import { MU } from "markupeditor"` to
// in the built bundle. There is no real markup-editor.js file in this repo at that path (the
// real app copies one in at runtime); this stub stands in for it so tier-2/3 tests can import
// and exercise the actual bundled dist/exporter-epub.js, not just its src/ sources.
export const MU = {
    getHTML: () => '',
    registerPlugin: () => {},
    activeView: () => null,
}

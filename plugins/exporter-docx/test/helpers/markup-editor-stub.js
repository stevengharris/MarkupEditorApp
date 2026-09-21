// Aliased (via vitest.config.js) to the relative `./markup-editor.js` specifier rollup's
// `paths` config rewrites `import { MU } from "markupeditor"` to in the built bundle. There is
// no real markup-editor.js file in this repo at that path (the app copies one in at runtime);
// this stub stands in so the full-pipeline test can import and exercise the actual bundled
// dist/exporter-docx.js, not just src/.
export const MU = {
    getHTML: () => '',
    registerPlugin: () => {},
}

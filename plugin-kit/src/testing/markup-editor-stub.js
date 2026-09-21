// Stands in for the relative `./markup-editor.js` that rollup's `paths` config rewrites the
// bare `markupeditor` import to in a built plugin. There is no such file in this repo (the app
// copies the real bundle in at runtime); vitestConfig.js aliases that specifier here so tests
// can import and exercise the actual built dist. Tests set the members they need.
export const MU = {
    getHTML: () => '',
    registerPlugin: () => {},
    activeView: () => null,
}

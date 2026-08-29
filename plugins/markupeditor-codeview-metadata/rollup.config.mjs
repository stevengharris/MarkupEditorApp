import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import css from 'rollup-plugin-import-css';

export default {
	input: 'src/metadataplugin.js',
	// prosemirror-model/-state/-view are already bundled inside markup-editor.js
	// and re-exported from there. Declaring them external prevents duplicate
	// copies in this bundle (ProseMirror uses instanceof checks internally, so a
	// second copy of e.g. Decoration wouldn't satisfy checks against the shared
	// EditorView's copy); paths rewrites the bare specifiers to the relative URL
	// both files share at runtime (they land in the same WKWebView cache directory).
	external: ['prosemirror-model', 'prosemirror-state', 'prosemirror-view', 'markupeditor'],
	output: {
		file: 'dist/markupeditor-codeview-metadata.js',
		format: 'es',
		inlineDynamicImports: true,
		paths: {
			'prosemirror-model': './markup-editor.js',
			'prosemirror-state': './markup-editor.js',
			'prosemirror-view': './markup-editor.js',
			'markupeditor': './markup-editor.js'
		}
	},
	plugins: [
		resolve(),
		commonjs(),
		css()	// so we can import css, matching markupeditor-base's own approach
	]
};

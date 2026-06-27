import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
	input: 'src/markup-editor-markdown.js',
	// prosemirror-model is already bundled inside markup-editor.js and re-exported
	// from there. Declaring it external prevents a duplicate copy in this bundle;
	// paths rewrites the bare specifier to the relative URL both files share at
	// runtime (they land in the same WKWebView cache directory).
	external: ['prosemirror-model', 'markupeditor'],
	output: {
		file: 'dist/markup-editor-markdown.js',
		format: 'es',
		paths: {
			'prosemirror-model': './markup-editor.js',
			'markupeditor': './markup-editor.js'
		}
	},
	plugins: [
		resolve(),
		commonjs()
	]
};

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import inject from '@rollup/plugin-inject';

export default {
	input: 'src/docxexporter.js',
	// markupeditor is already bundled inside markup-editor.js and re-exported from
	// there. Declaring it external prevents a duplicate copy in this bundle; paths
	// rewrites the bare specifier to the relative URL both files share at runtime
	// (they land in the same WKWebView cache directory).
	external: ['markupeditor'],
	output: {
		file: 'dist/exporter-docx.js',
		format: 'es',
		inlineDynamicImports: true,
		paths: {
			'markupeditor': './markup-editor.js'
		}
	},
	plugins: [
		resolve({ browser: true, preferBuiltins: false }),
		commonjs(),
		inject({ Buffer: ['buffer', 'Buffer'] })
	]
};

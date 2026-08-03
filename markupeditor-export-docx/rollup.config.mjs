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
		file: 'dist/markupeditor-export-docx.js',
		format: 'es',
		inlineDynamicImports: true,
		// docx already bundles a `global` shim
		// (node_modules/vite-plugin-node-polyfills/shims/global/dist/index.js,
		// `var global; global = globalThis || self;`) -- no intro shim needed here, and
		// adding one causes a "Identifier 'global' has already been declared" SyntaxError
		// since Rollup flattens ES modules into one shared top-level scope.
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

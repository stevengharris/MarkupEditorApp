import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
	input: 'src/markup-editor-markdown.js',
	output: {
		file: 'dist/markup-editor-markdown.js',
		format: 'es'
	},
	plugins: [
		resolve(),
		commonjs()
	]
};

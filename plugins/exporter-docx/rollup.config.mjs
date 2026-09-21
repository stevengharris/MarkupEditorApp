import inject from '@rollup/plugin-inject'
import { pluginConfig } from 'markupeditor-plugin-kit/rollup'

export default pluginConfig(import.meta.dirname, {
	input: 'src/docxexporter.js',
	plugins: [inject({ Buffer: ['buffer', 'Buffer'] })],
})

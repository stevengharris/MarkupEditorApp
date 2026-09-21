// Rebuilds dist/exporter-docx.js before any test runs -- see vitest.config.js's globalSetup
// comment for why this runs here instead of an npm pretest script.
import { execFileSync } from 'node:child_process'
import path from 'node:path'

export default function setup() {
    execFileSync('npx', ['rollup', '-c'], { cwd: path.resolve(import.meta.dirname, '..'), stdio: 'inherit' })
}

// Runs once before any test file, regardless of entry point (`npm test`, bare `vitest run`,
// watch mode from an editor) -- unlike npm's `pretest` lifecycle hook, which only fires for
// `npm test` specifically. Tier-2/3 tests import the real built dist/exporter-epub.js (not
// src/), so a stale dist tested as if fresh would be a worse gap than not testing dist at all:
// it would report false confidence. Rebuilding unconditionally here closes that gap for every
// way these tests can be invoked.
import { execFileSync } from 'node:child_process'
import path from 'node:path'

export default function setup() {
    execFileSync('npx', ['rollup', '-c'], { cwd: path.resolve(import.meta.dirname, '..'), stdio: 'inherit' })
}

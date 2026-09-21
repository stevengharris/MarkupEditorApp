import { execFileSync } from 'node:child_process'

// Vitest globalSetup: rebuilds the plugin's dist before any test runs, regardless of entry
// point (npm test, a bare `vitest run`, watch mode). Unlike npm's `pretest` hook, which only
// fires for `npm test`, this can't leave a stale dist under test.
export default function setup(project) {
    execFileSync('npx', ['rollup', '-c'], { cwd: project.config.root, stdio: 'inherit' })
}

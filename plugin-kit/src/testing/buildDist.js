import { execFileSync } from 'node:child_process'
import path from 'node:path'

// The plugin directory: where its vitest config lives, so this holds however vitest is invoked
// (project.config.root is just the working directory unless --root is given).
export function pluginDirOf(project) {
    const configFile = project.vite?.config?.configFile
    return configFile ? path.dirname(configFile) : project.config.root
}

// Vitest globalSetup: rebuilds the plugin's dist before any test runs, regardless of entry
// point (npm test, a bare `vitest run`, watch mode). Unlike npm's `pretest` hook, which only
// fires for `npm test`, this can't leave a stale dist under test.
export default function setup(project) {
    execFileSync('npx', ['rollup', '-c'], { cwd: pluginDirOf(project), stdio: 'inherit' })
}

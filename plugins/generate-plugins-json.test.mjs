import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadPluginMetadata } from './generate-plugins-json.mjs'

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function makeFixture(plugins) {
  const dir = await mkdtemp(path.join(tmpdir(), 'plugins-fixture-'))
  tempDirs.push(dir)
  for (const [dirName, pkg] of Object.entries(plugins)) {
    const pluginDir = path.join(dir, dirName)
    await mkdir(pluginDir, { recursive: true })
    await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8')
  }
  return dir
}

function normalPkg(dirName, displayName, overrides = {}) {
  return {
    name: dirName,
    description: 'A test plugin',
    author: 'Test Author',
    version: '1.0.0',
    main: 'dist/index.js',
    markupeditor: { name: displayName, type: 'codeview' },
    ...overrides,
  }
}

describe('internal plugins', () => {
  it('excludes a markupeditor.internal: true plugin from the generated output', async () => {
    const dir = await makeFixture({
      'markupeditor-codeview-metadata': normalPkg('markupeditor-codeview-metadata', 'Metadata', {
        markupeditor: { name: 'Metadata', type: 'codeview', internal: true },
      }),
      'markupeditor-codeview-mermaid': normalPkg('markupeditor-codeview-mermaid', 'Mermaid'),
    })

    const result = await loadPluginMetadata(dir)

    expect(result.codeview.Metadata).toBeUndefined()
    expect(result.codeview.Mermaid).toBeDefined()
  })

  it('skips an internal plugin BEFORE validation -- a missing required field does not throw', async () => {
    const dir = await makeFixture({
      'markupeditor-codeview-metadata': {
        name: 'markupeditor-codeview-metadata',
        main: 'dist/index.js',
        markupeditor: { name: 'Metadata', type: 'codeview', internal: true },
        // Deliberately no description/author/version -- would fail
        // validation if this plugin weren't skipped before that runs.
      },
    })

    await expect(loadPluginMetadata(dir)).resolves.toEqual({ codeview: {}, exporter: {} })
  })

  it('a plugin with no "internal" field at all (the common case) still validates and is included', async () => {
    const dir = await makeFixture({
      'markupeditor-codeview-mermaid': normalPkg('markupeditor-codeview-mermaid', 'Mermaid'),
    })

    const result = await loadPluginMetadata(dir)
    expect(result.codeview.Mermaid).toBeDefined()
  })

  it('internal: false is treated the same as no field at all -- still validated and included', async () => {
    const dir = await makeFixture({
      'markupeditor-codeview-mermaid': normalPkg('markupeditor-codeview-mermaid', 'Mermaid', {
        markupeditor: { name: 'Mermaid', type: 'codeview', internal: false },
      }),
    })

    const result = await loadPluginMetadata(dir)
    expect(result.codeview.Mermaid).toBeDefined()
  })
})

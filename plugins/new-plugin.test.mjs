import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { scaffoldPlugin, slugify } from './new-plugin.mjs'
import { loadPluginMetadata } from './generate-plugins-json.mjs'

const tempDirs = []

async function tempPlugins() {
  const dir = await mkdtemp(path.join(tmpdir(), 'new-plugin-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Graph Viz!')).toBe('graph-viz')
    expect(slugify('LaTeX')).toBe('latex')
  })
})

describe('scaffoldPlugin', () => {
  it('creates an exporter that the manifest generator accepts', async () => {
    const pluginsDir = await tempPlugins()
    const { dirName, files } = await scaffoldPlugin({ pluginsDir, type: 'exporter', name: 'LaTeX', ext: 'tex', author: 'A <a@example.com>' })
    expect(dirName).toBe('exporter-latex')
    expect(files).toEqual(expect.arrayContaining([
      'package.json', 'rollup.config.mjs', 'vitest.config.js', 'src/latex.js',
      'test/registration-contract.test.js', 'test/latex.test.js', 'README.md',
    ]))
    const pkg = JSON.parse(await readFile(path.join(pluginsDir, dirName, 'package.json'), 'utf8'))
    expect(pkg.main).toBe('dist/exporter-latex.js')
    expect(pkg.markupeditor).toEqual({ name: 'LaTeX', type: 'exporter', ext: 'tex' })
    const manifest = await loadPluginMetadata(pluginsDir)
    expect(manifest.exporter.LaTeX.ext).toBe('tex')
  })

  it('defaults the extension to the name', async () => {
    const pluginsDir = await tempPlugins()
    await scaffoldPlugin({ pluginsDir, type: 'exporter', name: 'Foo Bar' })
    const pkg = JSON.parse(await readFile(path.join(pluginsDir, 'exporter-foo-bar', 'package.json'), 'utf8'))
    expect(pkg.markupeditor.ext).toBe('foobar')
  })

  it('creates a codeview with no extension and no behavior test', async () => {
    const pluginsDir = await tempPlugins()
    const { dirName, files } = await scaffoldPlugin({ pluginsDir, type: 'codeview', name: 'Graphviz', ext: 'ignored' })
    expect(dirName).toBe('codeview-graphviz')
    expect(files).not.toContain('test/graphviz.test.js')
    const manifest = await loadPluginMetadata(pluginsDir)
    expect(manifest.codeview.Graphviz.name).toBe('Graphviz')
    expect(manifest.codeview.Graphviz.ext).toBeUndefined()
  })

  it('refuses an existing directory, writing nothing more', async () => {
    const pluginsDir = await tempPlugins()
    await scaffoldPlugin({ pluginsDir, type: 'codeview', name: 'Graphviz' })
    await expect(scaffoldPlugin({ pluginsDir, type: 'codeview', name: 'Graphviz' })).rejects.toThrow('already exists')
  })

  it.each([
    [{ type: 'filter', name: 'X' }, '--type'],
    [{ type: 'exporter', name: '  ' }, '--name is required'],
    [{ type: 'exporter', name: '9Lives' }, 'start with a letter'],
    [{ type: 'exporter', name: 'X', ext: '.tex' }, '--ext'],
    [{ type: 'exporter', name: 'X', ext: 'TeX' }, '--ext'],
  ])('rejects invalid arguments %j', async (args, message) => {
    const pluginsDir = await tempPlugins()
    await expect(scaffoldPlugin({ pluginsDir, ...args })).rejects.toThrow(message)
  })
})

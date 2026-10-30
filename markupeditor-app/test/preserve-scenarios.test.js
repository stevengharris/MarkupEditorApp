import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { MU, EditorState, DOMParser } from 'markupeditor'
import { history, undo } from 'prosemirror-history'
import { exportMarkdown, importMarkdown } from '../src/markdown.js'
import { rebaseSource, getSourceMap } from '../src/source-map.js'
import { describeBlocks } from '../src/doc-blocks.js'
import { planReplace } from '../src/replace-blocks.js'

// Report one extra top-level block token when a test asks for it.
const lie = vi.hoisted(() => ({ on: false }))
vi.mock('../src/parser.js', async (original) => {
  const module = await original()
  return {
    ...module,
    makeParser: (...args) => {
      const parser = module.makeParser(...args)
      const recorder = args[2]
      if (!recorder) return parser
      const parse = parser.parse.bind(parser)
      parser.parse = (text) => { const doc = parse(text); if (lie.on) recorder.push(recorder[0]); return doc }
      return parser
    },
  }
})

const { schema } = MU

// The editor under test: the state MU.activeView() reports.
let current
const showing = () => ({ state: current })

// Load `text` the way the app does (import, then rebase) and return what rebaseSource reports.
function load(text) {
  current = EditorState.create({ schema })
  const html = JSON.parse(importMarkdown(text)).result
  const div = document.createElement('div')
  div.innerHTML = html
  current = EditorState.create({ doc: DOMParser.fromSchema(schema).parse(div), plugins: [history()] })
  return JSON.parse(rebaseSource(text))
}

function edit(find, replacement) {
  let from = -1
  current.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text.includes(find)) from = pos + node.text.indexOf(find)
  })
  expect(from, `"${find}" not found`).toBeGreaterThanOrEqual(0)
  current = current.apply(current.tr.insertText(replacement, from, from + find.length))
}

const save = (tag) => JSON.parse(exportMarkdown({ preserve: true, tag }))
const blocksOf = (text) => text.split(/\r?\n\r?\n/)

beforeEach(() => {
  vi.spyOn(MU, 'activeView').mockImplementation(showing)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  lie.on = false
})
afterEach(() => vi.restoreAllMocks())

const WRAPPED = [
  '# Notes', '',
  'This paragraph is hard wrapped', 'across three lines so that a', 'one word edit stays local.', '',
  '- first item wraps onto', '  a second line', '- second item', '',
  'Closing paragraph.',
].join('\n')

describe('edit shapes', () => {
  test.each([
    ['LF', '\n', true],
    ['LF, no final newline', '\n', false],
    ['CRLF', '\r\n', true],
    ['CRLF, no final newline', '\r\n', false],
  ])('open and save with no edit returns the source: %s', (_, eol, finalNewline) => {
    const text = WRAPPED.replace(/\n/g, eol) + (finalNewline ? eol : '')
    const { tag } = load(text)
    expect(save(tag).result).toBe(text)
  })

  test('with front matter the body is returned and the front matter is left to the caller', () => {
    const text = '---\ntitle: T\n---\n\n' + WRAPPED + '\n'
    const { tag, frontMatter } = load(text)
    expect(frontMatter).toBe('---\ntitle: T\n---\n\n')
    expect(save(tag).result).toBe(text.slice(frontMatter.length))
  })

  test('changing one word changes only the lines of that paragraph', () => {
    const { tag } = load(WRAPPED + '\n')
    edit('stays', 'remains')
    const out = save(tag).result
    const before = blocksOf(WRAPPED + '\n')
    const after = blocksOf(out)
    expect(after.length).toBe(before.length)
    after.forEach((block, i) => { if (i !== 1) expect(block).toBe(before[i]) })
    expect(after[1]).toContain('remains')
    expect(after[1]).not.toContain('stays')
  })

  test('an edit followed by undo returns the source', () => {
    const { tag } = load(WRAPPED + '\n')
    edit('stays', 'remains')
    expect(save(tag).result).not.toBe(WRAPPED + '\n')
    undo(current, (tr) => { current = current.apply(tr) })
    expect(save(tag).result).toBe(WRAPPED + '\n')
  })

  test('inserting a block changes only the new block', () => {
    const text = 'first\n\nsecond\n\nthird\n'
    const { tag } = load(text)
    const at = current.doc.child(0).nodeSize
    current = current.apply(current.tr.insert(at, schema.nodes.paragraph.create(null, schema.text('inserted'))))
    expect(save(tag).result).toBe('first\n\ninserted\n\nsecond\n\nthird\n')
  })

  test('deleting a block changes only that block', () => {
    const text = '*first*\n\nsecond\n\n*third*\n'
    const { tag } = load(text)
    const from = current.doc.child(0).nodeSize
    current = current.apply(current.tr.delete(from, from + current.doc.child(1).nodeSize))
    expect(save(tag).result).toBe('*first*\n\n*third*\n')
  })

  test('moving a block rewrites only the moved block', () => {
    const text = '_a_\n\n_b_\n\n_c_\n'
    const { tag } = load(text)
    const first = current.doc.child(0)
    let tr = current.tr.delete(0, first.nodeSize)
    tr = tr.insert(tr.doc.content.size, first)
    current = current.apply(tr)
    expect(save(tag).result).toBe('_b_\n\n_c_\n\n*a*\n')
  })

  test('editing a list item rewrites the list and nothing else', () => {
    const { tag } = load(WRAPPED + '\n')
    edit('second item', 'second entry')
    const out = save(tag).result
    const before = blocksOf(WRAPPED + '\n')
    expect(out.startsWith(before[0] + '\n\n' + before[1] + '\n\n')).toBe(true)
    expect(out.endsWith('\n\n' + before[3])).toBe(true)
    expect(out).toContain('second entry')
  })

  test('saving, editing and saving again diffs against the first save', () => {
    const first = load(WRAPPED + '\n')
    edit('stays', 'remains')
    const saved = save(first.tag).result
    const second = JSON.parse(rebaseSource(saved))
    edit('Closing', 'Final')
    const out = save(second.tag).result
    const before = blocksOf(saved)
    const after = blocksOf(out)
    after.forEach((block, i) => { if (i !== after.length - 1) expect(block).toBe(before[i]) })
    expect(after[after.length - 1]).toContain('Final')
  })
})

describe('edge scenarios', () => {
  test('raw HTML the schema drops between unedited blocks survives a save', () => {
    const text = '_a_\n\n<div>kept</div>\n\n_b_\n'
    const { tag } = load(text)
    const out = save(tag)
    expect(out.result).toBe(text)
    expect(out.warnings).toEqual([])
  })

  test('reference definitions warn at load, and used links are written inline when a neighbor is edited', () => {
    const text = 'Intro text.\n\nSee [the site][x] now.\n\nTail.\n\n[x]: http://example.com\n'
    const imported = JSON.parse(importMarkdown(text))
    expect(imported.warnings).toContain('Link reference definitions are saved as inline links.')
    const { tag } = load(text)
    edit('Tail', 'Ending')
    const out = save(tag).result
    expect(out).toContain('[the site](http://example.com)')
    expect(out).not.toContain('[the site][x]')
  })

  test('a token and node count mismatch records no map and exports today\'s output', () => {
    lie.on = true
    const { tag } = load('_a_\n\n_b_\n')
    expect(tag).toBeNull()
    expect(getSourceMap()).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Source map not recorded'))
    lie.on = false
    expect(save(tag).result).toBe(JSON.parse(exportMarkdown()).result)
  })

  test('replace_blocks changes only the replaced blocks', () => {
    const text = '_a_\n\n_b_\n\n_c_\n'
    const { tag } = load(text)
    const blocks = describeBlocks(current.doc, {}).blocks
    const result = planReplace(current, { index: 1, count: 1, markdown: 'replaced', expected: [blocks[1].hash], allowLoss: false })
    expect(result.ok, result.reason).toBe(true)
    current = current.apply(result.tr)
    expect(save(tag).result).toBe('_a_\n\nreplaced\n\n_c_\n')
  })

  test('a stale map and a null tag both export today\'s output', () => {
    const a = load('_a_\r\n\r\n_b_\r\n\r\n\r\n')
    const stale = '*x*\n\ny\n'
    const html = JSON.parse(importMarkdown(stale)).result
    const div = document.createElement('div')
    div.innerHTML = html
    current = EditorState.create({ doc: DOMParser.fromSchema(schema).parse(div) })
    const today = JSON.parse(exportMarkdown()).result
    const out = save(a.tag).result
    expect(out).toBe(today)
    expect(out).not.toContain('\r')
    expect(save(null).result).toBe(today)
  })
})

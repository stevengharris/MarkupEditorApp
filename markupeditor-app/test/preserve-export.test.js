import { beforeAll, describe, test, expect, vi } from 'vitest'
import { MU } from 'markupeditor'
import { exportMarkdown, getMarkdown } from '../src/markdown.js'
import { rebaseSource, getSourceMap, editorDocument } from '../src/source-map.js'
import { matchBlocks } from '../src/preserve.js'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'

const { schema } = MU

// The document the editor holds: parsed, then through HTML like a loaded file.
const parse = (text) => editorDocument(makeParser(schema, makeWarnings()).parse(text.replace(/\r\n/g, '\n')), schema)
const show = (doc) => MU.activeView.mockReturnValue({ state: { doc, schema } })

// Record `base` as the source, show `edited` in the editor, and export with preservation.
const exported = (base, edited) => {
  show(parse(base))
  const { tag } = JSON.parse(rebaseSource(base))
  show(parse(edited))
  return JSON.parse(exportMarkdown({ preserve: true, tag }))
}
const preserved = (base, edited) => exported(base, edited).result

beforeAll(() => { vi.spyOn(MU, 'activeView') })

describe('preserving export', () => {
  const body = ['# Title', '', 'First para', 'wraps here.', '', '* one', '* two', '', '```js', 'let a = 1', '```', '', 'Tail.']

  test.each([
    ['LF', '\n', true],
    ['LF, no final newline', '\n', false],
    ['CRLF', '\r\n', true],
    ['CRLF, no final newline', '\r\n', false],
  ])('no edit returns the source byte for byte: %s', (_, eol, finalNewline) => {
    const base = body.join(eol) + (finalNewline ? eol : '')
    expect(preserved(base, base)).toBe(base)
  })

  test('no edit in a mixed file returns the source byte for byte', () => {
    const base = '# T\r\n\r\npara\n\n* a\r\n* b\r\n\r\nend\n'
    expect(preserved(base, base)).toBe(base)
  })

  test('appending a word to a wrapped paragraph changes only that paragraph', () => {
    const base = '# T\n\nline one\nline two\n\nafter\n'
    const out = preserved(base, '# T\n\nline one\nline two word\n\nafter\n')
    expect(out.startsWith('# T\n\n')).toBe(true)
    expect(out.endsWith('\n\nafter\n')).toBe(true)
    expect(out).toContain('word')
    expect(out).not.toBe(base)
  })

  test('insert keeps neighbors untouched', () => {
    const base = '_a_\n\n_b_\n'
    const out = preserved(base, '_a_\n\nnew\n\n_b_\n')
    expect(out).toBe('_a_\n\nnew\n\n_b_\n')
  })

  test('delete keeps neighbors untouched', () => {
    const base = '_a_\n\n_b_\n\n_c_\n'
    expect(preserved(base, '_a_\n\n_c_\n')).toBe('_a_\n\n_c_\n')
  })

  test('moving a block rewrites only the moved block', () => {
    const base = '_a_\n\n_b_\n\n_c_\n'
    expect(preserved(base, '*b*\n\n*c*\n\n*a*\n')).toBe('_b_\n\n_c_\n\n*a*\n')
  })

  test('adjacent unchanged blocks keep their original gap', () => {
    const base = '_a_\n\n\n\n_b_\n\nold\n'
    expect(preserved(base, '_a_\n\n\n\n_b_\n\nnew\n')).toBe('_a_\n\n\n\n_b_\n\nnew\n')
  })

  test('identical blocks: the match nearest in position is kept', () => {
    const base = 'x\n\n_dup_\n\n*dup*\n\nz\n'
    const out = preserved(base, 'y\n\n*dup*\n\nw\n')
    expect(out).toContain('_dup_')
    expect(out).not.toContain('*dup*')
  })

  test('a block that cannot be preserved is rewritten and its neighbors are kept', () => {
    const base = '_b_\n\nSee [a][x].\n\n_c_\n\n[x]: http://example.com\n'
    const out = preserved(base, base)
    expect(out).toContain('_b_')
    expect(out).toContain('_c_')
    expect(out).toContain('[a](http://example.com)')
    expect(out).not.toContain('[a][x]')
  })

  test('new text uses the dominant line ending and the final newline state', () => {
    expect(preserved('_a_\r\n\r\n_b_\r\n', '_a_\r\n\r\n_b_\r\n\r\nnew\r\n')).toBe('_a_\r\n\r\n_b_\r\n\r\nnew\r\n')
    expect(preserved('_a_\n\n_b_', '_a_\n\n_b_\n\nnew\n')).toBe('_a_\n\n_b_\n\nnew')
  })

  test('an edit followed by an undo returns the source', () => {
    const base = '_a_\n\n_b_\n'
    show(parse(base))
    const { tag } = JSON.parse(rebaseSource(base))
    show(parse('_a_\n\nedited\n'))
    show(parse(base))
    expect(JSON.parse(exportMarkdown({ preserve: true, tag })).result).toBe(base)
  })
})

describe('export without preservation', () => {
  const base = '_a_\n\n_b_\n'
  const today = () => { show(parse(base)); return exportMarkdown() }

  test('a tag mismatch, no map, preserve false, no options and a string argument return the same output', () => {
    const expected = today()
    show(parse(base))
    const { tag } = JSON.parse(rebaseSource(base))
    expect(exportMarkdown({ preserve: true, tag: 'other' })).toBe(expected)
    expect(exportMarkdown({ preserve: false, tag })).toBe(expected)
    expect(exportMarkdown({ tag })).toBe(expected)
    expect(exportMarkdown('<p>x</p>')).toBe(expected)
    expect(exportMarkdown(null)).toBe(expected)
    rebaseSource('')
    expect(exportMarkdown({ preserve: true, tag })).toBe(expected)
  })

  test('the result keeps the { result, warnings } shape', () => {
    show(parse(base))
    const { tag } = JSON.parse(rebaseSource(base))
    const out = JSON.parse(exportMarkdown({ preserve: true, tag }))
    expect(Object.keys(out).sort()).toEqual(['result', 'warnings'])
  })

  test('getMarkdown never preserves', () => {
    show(parse(base))
    rebaseSource(base)
    expect(getMarkdown()).toBe(JSON.parse(today()).result)
    expect(getMarkdown()).toContain('*a*')
  })

  test('with no active view the result is null', () => {
    MU.activeView.mockReturnValue(null)
    expect(JSON.parse(exportMarkdown({ preserve: true, tag: 'x' }))).toEqual({ result: null, warnings: ['No active view'] })
  })
})

describe('leading and trailing text', () => {
  test('leading blank lines are kept when the first block is unchanged', () => {
    const base = '\n\n_a_\n\n_b_\n'
    expect(preserved(base, base)).toBe(base)
    expect(preserved(base, '*a*\n\nnew\n')).toBe('\n\n_a_\n\nnew\n')
  })

  test('leading blank lines are dropped when the first block is edited', () => {
    const out = exported('\n\n_a_\n\n_b_\n', 'changed\n\n*b*\n')
    expect(out.result).toBe('changed\n\n_b_\n')
    expect(out.warnings).toEqual([])
  })

  test('a trailing definition is kept when the last block is unchanged', () => {
    const base = '_a_\n\nuse [it][x]\n\n_z_\n\n[x]: http://example.com\n'
    expect(preserved(base, base)).toContain('\n\n[x]: http://example.com\n')
    expect(preserved(base, base).endsWith('_z_\n\n[x]: http://example.com\n')).toBe(true)
  })

  test('a trailing definition is dropped with a warning when the last block is edited', () => {
    const base = '_a_\n\nlast\n\n[x]: http://example.com\n'
    const out = exported(base, '*a*\n\nedited\n')
    expect(out.result).toBe('_a_\n\nedited\n')
    expect(out.warnings.length).toBe(1)
  })

  test('trailing blank lines are dropped without a warning when the last block is edited', () => {
    const out = exported('_a_\n\nlast\n\n\n', '*a*\n\nedited\n')
    expect(out.result).toBe('_a_\n\nedited\n')
    expect(out.warnings).toEqual([])
  })

  test.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('trailing blank lines before an end without a final newline are byte-equal: %s', (_, eol) => {
    const base = `_a_${eol}${eol}_b_${eol}${eol}  `
    expect(preserved(base, base)).toBe(base)
  })
})

describe('save warnings', () => {
  const html = '_a_\n\n<div>gone</div>\n\n_b_\n'
  const definition = '_a_\n\n[x]: http://example.com\n\n_b_\n'

  test('stripped HTML between unedited blocks is kept without a warning', () => {
    const out = exported(html, html)
    expect(out.result).toBe(html)
    expect(out.warnings).toEqual([])
  })

  test('stripped HTML next to an edited block is dropped with one warning', () => {
    const out = exported(html, 'changed\n\n*b*\n')
    expect(out.result).toBe('changed\n\n_b_\n')
    expect(out.warnings.length).toBe(1)
    expect(out.warnings[0]).toMatch(/^Raw HTML next to an edited block was not saved: <div>gone<\/div>/)
  })

  test('a definition between preserved blocks is kept without a warning', () => {
    const out = exported(definition, definition)
    expect(out.result).toBe(definition)
    expect(out.warnings).toEqual([])
  })

  test('a definition next to an edited block is dropped with a warning naming it', () => {
    const out = exported(definition, 'changed\n\n*b*\n')
    expect(out.warnings).toEqual(['Link reference definition was not saved: x'])
  })

  test('stripped HTML next to a block that cannot be preserved warns on every save', () => {
    const base = 'See [a][x].\n\n<div>gone</div>\n\n_b_\n\n[x]: http://example.com\n'
    const out = exported(base, base)
    expect(out.warnings.some(w => w.startsWith('Raw HTML next to an edited block was not saved'))).toBe(true)
  })

  test('blank gaps never warn', () => {
    const out = exported('_a_\n\n\n\n_b_\n', 'changed\n\n*b*\n')
    expect(out.warnings).toEqual([])
  })

  test('long dropped text is cut to 60 characters', () => {
    const long = `<div>${'x'.repeat(100)}</div>`
    const out = exported(`_a_\n\n${long}\n\n_b_\n`, 'changed\n\n*b*\n')
    expect(out.warnings[0]).toBe(`Raw HTML next to an edited block was not saved: ${long.slice(0, 60)}`)
  })
})

describe('review findings', () => {
  test.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('a preserved list before an edited block does not gain a blank line: %s', (_, eol) => {
    const base = ['Intro', '', '* a', '* b', '', 'Tail text', ''].join(eol)
    const out = preserved(base, 'Intro\n\n* a\n* b\n\nEnd text\n')
    expect(out).toBe(['Intro', '', '* a', '* b', '', 'End text', ''].join(eol))
  })

  test('a preserved ordered list followed by extra blank lines gets one blank line before an edited block', () => {
    const base = '1. a\n2. b\n\n\nz\n'
    expect(preserved(base, '1. a\n2. b\n\nchanged\n')).toBe('1. a\n2. b\n\nchanged\n')
  })

  test('serializer warnings for an edited block are reported', () => {
    const base = 'hello world\n\nz\n'
    show(parse(base))
    const { tag } = JSON.parse(rebaseSource(base))
    const doc = parse(base)
    const marked = doc.type.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('hello', [schema.marks.u.create()]), schema.text(' world')]),
      doc.child(1),
    ])
    show(marked)
    const out = JSON.parse(exportMarkdown({ preserve: true, tag }))
    expect(out.warnings).toEqual(JSON.parse(exportMarkdown()).warnings)
    expect(out.warnings.length).toBe(1)
  })

  test.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('a single edited block keeps the line ending and final newline: %s', (_, eol) => {
    expect(preserved(`Hello world${eol}`, 'Howdy world\n')).toBe(`Howdy world${eol}`)
    expect(preserved(`one${eol}${eol}two${eol}`, 'uno\n\ndos\n')).toBe(`uno${eol}${eol}dos${eol}`)
  })

  test('a very large middle is not matched, only the prefix and suffix', () => {
    const shared = Array.from({ length: 6000 }, (_, i) => `x${i}`)
    const base = ['f', ...shared, 'l'].map(baseline => ({ baseline, preservable: true }))
    const current = ['F', ...shared, 'L'].map(hash => ({ hash }))
    expect(matchBlocks(base, current).size).toBe(0)
    expect(matchBlocks(base.slice(0, 50), current.slice(0, 50)).size).toBe(49)
  })
})

describe('review follow-ups', () => {
  test('one changed block in the middle of a long list is matched on both sides', () => {
    const shared = Array.from({ length: 12000 }, (_, i) => `x${i}`)
    const base = shared.map(baseline => ({ baseline, preservable: true }))
    const current = shared.map((hash, i) => ({ hash: i === 6000 ? 'changed' : hash }))
    expect(matchBlocks(base, current).size).toBe(11999)
  })

  test('a multi-line edited block uses the dominant line ending on every line', () => {
    const out = preserved('_a_\r\n\r\n* x\r\n* y\r\n', '*a*\n\n* x\n* z\n')
    expect(out.replace(/\r\n/g, '')).not.toContain('\n')
  })

  test('a failure while assembling falls back to the whole-document export', () => {
    const base = '_a_\n\n_b_\n'
    show(parse(base))
    const { tag } = JSON.parse(rebaseSource(base))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getSourceMap().blocks = null
    const out = JSON.parse(exportMarkdown({ preserve: true, tag }))
    expect(out.result).toBe(JSON.parse(exportMarkdown()).result)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Preserving export failed'))
    warn.mockRestore()
  })

  test('text before the first block is dropped with a warning when that block is edited', () => {
    const out = exported('[x]: http://example.com\n\n_a_\n\n_b_\n', 'changed\n\n*b*\n')
    expect(out.warnings).toEqual(['Text before the first block was dropped because that block was edited'])
  })

  test('non-string source records no map', () => {
    const out = JSON.parse(rebaseSource(123))
    expect(out.tag).toBeNull()
    expect(out.warnings).toEqual(['Source text is not a string'])
  })
})

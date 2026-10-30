import { beforeAll, beforeEach, afterEach, describe, test, expect, vi } from 'vitest'
import { MU } from 'markupeditor'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { hashMarkdown, describeBlocks } from '../src/doc-blocks.js'
import { buildSourceMap, rebaseSource, getSourceMap } from '../src/source-map.js'

const { schema } = MU

const produced = (md) => {
  const warnings = makeWarnings()
  const recorder = []
  const doc = makeParser(schema, warnings, recorder).parse(md)
  return { doc, recorder, warnings: warnings.get() }
}

describe('parser reports node-producing tokens', () => {
  test.each([
    ['paragraph', 'Hello world'],
    ['heading', '# Title'],
    ['bullet list', '- a\n- b'],
    ['ordered list', '1. a\n2. b'],
    ['blockquote', '> quoted'],
    ['table', '| a | b |\n| - | - |\n| 1 | 2 |'],
    ['fence', '```js\nlet x = 1\n```'],
    ['hr', '---'],
  ])('%s reports one level-0 token with a map', (_, md) => {
    const { doc, recorder } = produced(md)
    expect(recorder.length).toBe(1)
    expect(recorder[0].level).toBe(0)
    expect(recorder[0].map).toBeTruthy()
    expect(doc.childCount).toBe(1)
  })

  test('an html_block with <img src> reports a producing token', () => {
    const { doc, recorder, warnings } = produced('<img src="a.png" alt="a">')
    expect(recorder.length).toBe(1)
    expect(recorder[0].type).toBe('html_block')
    expect(doc.childCount).toBe(1)
    expect(warnings).toEqual([])
  })

  test('an html_block without an img src reports none and still warns', () => {
    const { doc, recorder, warnings } = produced('<div>x</div>\n\nafter')
    expect(recorder.map(t => t.type)).toEqual(['paragraph_open'])
    expect(doc.childCount).toBe(1)
    expect(warnings.some(w => w.startsWith('Raw HTML block stripped'))).toBe(true)
  })

  test('an html_block with <img> but no src reports none', () => {
    const { recorder } = produced('<img alt="a">\n\nafter')
    expect(recorder.map(t => t.type)).toEqual(['paragraph_open'])
  })

  test('nested tokens are never reported', () => {
    const { recorder } = produced('- a\n  - b\n- c\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n> - q')
    expect(recorder.length).toBe(3)
    expect(recorder.every(t => t.level === 0)).toBe(true)
    expect(recorder.map(t => t.type)).toEqual(['bullet_list_open', 'table_open', 'blockquote_open'])
  })

  test('a converted leading HTML run reports one token', () => {
    const { doc, recorder } = produced('```html\n<div>a</div>\n\n<div>b</div>\n```\n\ntext')
    expect(recorder.map(t => t.type)).toEqual(['fence', 'paragraph_open'])
    expect(doc.childCount).toBe(2)
  })

  test('tokens are in document order and match the top-level node count', () => {
    const md = '# T\n\n<div>gone</div>\n\ntext\n\n- a\n\n---\n\n<img src="a.png">\n\n```\ncode\n```'
    const { doc, recorder } = produced(md)
    expect(recorder.length).toBe(doc.childCount)
    const starts = recorder.map(t => t.map[0])
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  test('without a recorder the result is unchanged', () => {
    const md = '# T\n\n<div>gone</div>\n\ntext **b**\n\n| a | b |\n| - | - |\n| 1 | 2 |'
    const w1 = makeWarnings()
    const w2 = makeWarnings()
    const plain = makeParser(schema, w1).parse(md)
    const recorded = makeParser(schema, w2, []).parse(md)
    expect(recorded.eq(plain)).toBe(true)
    expect(w2.get()).toEqual(w1.get())
  })
})

describe('rebaseSource', () => {
  beforeAll(() => { vi.spyOn(MU, 'activeView') })
  beforeEach(() => { MU.activeView.mockReturnValue({ state: { schema } }) })

  const build = (text) => buildSourceMap(text, schema)

  test('LF file records ranges, baselines and the final newline', () => {
    const { map } = build('# T\n\nPara one.\n\n- a\n- b\n')
    expect(map.lineEnding).toBe('LF')
    expect(map.finalNewline).toBe(true)
    expect(map.blocks.map(b => [b.startLine, b.endLine])).toEqual([[0, 1], [2, 3], [4, 6]])
    const described = describeBlocks(makeParser(schema, makeWarnings()).parse('# T\n\nPara one.\n\n- a\n- b\n'))
    expect(map.blocks.map(b => b.baseline)).toEqual(described.blocks.map(b => b.hash))
    expect(map.lines.join('')).toBe('# T\n\nPara one.\n\n- a\n- b\n')
  })

  test('no final newline is recorded', () => {
    const { map } = build('a\n\nb')
    expect(map.finalNewline).toBe(false)
    expect(map.blocks.map(b => [b.startLine, b.endLine])).toEqual([[0, 1], [2, 3]])
  })

  test('CRLF lines keep their terminators and the dominant ending is reported', () => {
    const text = '# T\r\n\r\nPara\r\n'
    const { map } = build(text)
    expect(map.lineEnding).toBe('CRLF')
    expect(map.lines).toEqual(['# T\r\n', '\r\n', 'Para\r\n'])
    expect(map.blocks.map(b => [b.startLine, b.endLine])).toEqual([[0, 1], [2, 3]])
  })

  test('mixed endings keep their own terminators; the majority wins', () => {
    const { map } = build('a\r\n\r\nb\n\nc\r\n')
    expect(map.lines).toEqual(['a\r\n', '\r\n', 'b\n', '\n', 'c\r\n'])
    expect(map.lineEnding).toBe('CRLF')
  })

  test.each([
    ['no blank line', '---\ntitle: x\n---\n# H\n', '---\ntitle: x\n---\n', 3],
    ['one blank line', '---\ntitle: x\n---\n\n# H\n', '---\ntitle: x\n---\n\n', 4],
    ['two blank lines', '---\ntitle: x\n---\n\n\n# H\n', '---\ntitle: x\n---\n\n\n', 5],
  ])('front matter followed by %s', (_, text, frontMatter, firstStart) => {
    const { map } = build(text)
    expect(map.frontMatter).toBe(frontMatter)
    expect(map.blocks.length).toBe(1)
    expect(map.blocks[0].startLine).toBe(firstStart)
    expect(map.blocks[0].baseline).toBe(hashMarkdown('# H'))
  })

  test('front matter keeps CRLF terminators', () => {
    const { map } = build('---\r\ntitle: x\r\n---\r\n\r\n# H\r\n')
    expect(map.frontMatter).toBe('---\r\ntitle: x\r\n---\r\n\r\n')
  })

  test('a file without front matter has a null frontMatter', () => {
    expect(build('# H\n').map.frontMatter).toBeNull()
  })

  test.each([
    ['one html_block', '<div>a</div>\n\ntext\n', [[0, 1], [2, 3]]],
    ['two html_blocks', '<div>a</div>\n\n<p>b</p>\n\ntext\n', [[0, 3], [4, 5]]],
  ])('a leading HTML run of %s is one block', (_, text, ranges) => {
    const { map } = build(text)
    expect(map.blocks.map(b => [b.startLine, b.endLine])).toEqual(ranges)
  })

  test('a leading HTML run after front matter maps to original lines', () => {
    const { map } = build('---\na: 1\n---\n\n<div>a</div>\n\ntext\n')
    expect(map.blocks.map(b => [b.startLine, b.endLine])).toEqual([[4, 5], [6, 7]])
  })

  test('a stripped mid-document HTML block is not a block', () => {
    const { map } = build('one\n\n<div>gone</div>\n\ntwo\n')
    expect(map.blocks.map(b => [b.startLine, b.endLine])).toEqual([[0, 1], [4, 5]])
  })

  test.each([
    ['empty', ''],
    ['blank lines', '\n\n'],
    ['front matter only', '---\na: 1\n---\n'],
  ])('an empty body (%s) records no map', (_, text) => {
    const result = build(text)
    expect(result.map).toBeNull()
    expect(result.reason).toMatch(/empty/)
  })

  test('a count mismatch records no map and logs', () => {
    const lying = (schema, warnings, recorder) => {
      const parser = makeParser(schema, warnings, recorder)
      const parse = parser.parse.bind(parser)
      parser.parse = (text) => { const doc = parse(text); recorder.push(recorder[0]); return doc }
      return parser
    }
    const result = buildSourceMap('a\n\nb\n', schema, lying)
    expect(result.map).toBeNull()
    expect(result.reason).toMatch(/count/)
  })

  test('the same text gives the same tag and different text a different one', () => {
    const tag = (text) => JSON.parse(rebaseSource(text)).tag
    expect(tag('a\n')).toBe(tag('a\n'))
    expect(tag('a\n')).not.toBe(tag('b\n'))
    expect(tag('a\n')).toBe(hashMarkdown('a\n'))
  })

  test('rebaseSource returns the envelope and records the map', () => {
    const out = JSON.parse(rebaseSource('---\na: 1\n---\n\n# H\n'))
    expect(out.frontMatter).toBe('---\na: 1\n---\n\n')
    expect(out.lineEnding).toBe('LF')
    expect(out.warnings).toEqual([])
    expect(getSourceMap().tag).toBe(out.tag)
  })

  test('rebaseSource on an unmappable body returns a null tag, warns and clears the map', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rebaseSource('# H\n')
    const out = JSON.parse(rebaseSource(''))
    expect(out.tag).toBeNull()
    expect(getSourceMap()).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Source map not recorded'))
    warn.mockRestore()
  })

  test('equal CRLF and LF line counts report LF', () => {
    expect(build('a\r\n\r\nb\n\n').map.lineEnding).toBe('LF')
  })

  test('a lone carriage return records no map', () => {
    expect(build('a\r\rb\n').map).toBeNull()
  })

  test('no active view returns a null tag', () => {
    MU.activeView.mockReturnValue(null)
    const out = JSON.parse(rebaseSource('a\n'))
    expect(out.tag).toBeNull()
    expect(out.warnings).toEqual(['No active view'])
  })
})

describe('not preservable', () => {
  const blocksOf = (text) => buildSourceMap(text, schema).map.blocks

  test('a reference link is not preservable; its neighbors are', () => {
    const blocks = blocksOf('Before.\n\nSee [a][x].\n\nAfter.\n\n[x]: http://example.com\n')
    expect(blocks.map(b => b.preservable)).toEqual([true, false, true])
  })

  test.each([
    ['an inline link', 'A [link](http://e.com) here.\n'],
    ['a setext heading', 'Title\n=====\n'],
    ['an indented code block', '    code line\n'],
    ['a table', '| a | b |\n| - | - |\n| 1 | 2 |\n'],
    ['a leading HTML run', '<div>a</div>\n\ntext\n'],
    ['a fenced html code block after the start', 'text\n\n```html\n<div>a</div>\n```\n'],
    ['an image html_block', 'text\n\n<img src="a.png" alt="a">\n'],
  ])('%s is preservable', (_, text) => {
    expect(blocksOf(text).every(b => b.preservable)).toBe(true)
  })

  test('a block whose range does not hold its node is not preservable', () => {
    const shifted = (schema, warnings, recorder) => {
      const parser = makeParser(schema, warnings, recorder)
      const parse = parser.parse.bind(parser)
      parser.parse = (text) => {
        const doc = parse(text)
        if (recorder) recorder[1] = { ...recorder[1], map: [0, 1] }
        return doc
      }
      return parser
    }
    const { map } = buildSourceMap('one\n\ntwo\n\nthree\n', schema, shifted)
    expect(map.blocks.map(b => b.preservable)).toEqual([true, false, true])
  })
})

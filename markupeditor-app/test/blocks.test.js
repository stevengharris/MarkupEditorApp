import { beforeAll, describe, test, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MU, EditorState } from 'markupeditor'
import MarkdownIt from 'markdown-it'
import frontMatterPlugin from 'markdown-it-front-matter'
import {
  blockIndexForPos,
  posForBlockIndex,
  topLevelBlockStarts,
  getSelectionBlockIndex,
  selectBlockIndex,
  blockIndexAtOffset,
  offsetForBlockIndex,
} from '../src/blocks.js'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'

const { schema } = MU

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fourParagraphDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, [schema.text('First')]),
    schema.nodes.paragraph.create(null, [schema.text('Second')]),
    schema.nodes.paragraph.create(null, [schema.text('Third')]),
    schema.nodes.paragraph.create(null, [schema.text('Fourth')]),
  ])
}

function singleParagraphDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, [schema.text('Only')]),
  ])
}

// The real schema's doc content expression is "block+" (markup-editor.js), so a
// zero-child doc.create(null, []) throws -- there is no way to construct a
// genuinely empty Node. blockIndexForPos/posForBlockIndex only ever touch
// doc.content.forEach, so a minimal duck-typed stand-in exercises the same
// boundary path without needing a real Node.
function emptyDocLike() {
  return { content: { forEach() {} } }
}

// ---------------------------------------------------------------------------
// blockIndexForPos
// ---------------------------------------------------------------------------

describe('blockIndexForPos', () => {
  test('multi-child doc: pos at exact start of a child returns that child index', () => {
    const doc = fourParagraphDoc()
    // offsets: child0=0 child1=7 child2=15 child3=22
    expect(blockIndexForPos(doc, 7)).toBe(1)
    expect(blockIndexForPos(doc, 15)).toBe(2)
  })

  test('pos at end of a child (still inside it) returns that child index', () => {
    const doc = fourParagraphDoc()
    // child0 spans [0,7); 6 is the position right after 'First', before the close token
    expect(blockIndexForPos(doc, 6)).toBe(0)
  })

  test('pos in the last child returns the last index', () => {
    const doc = fourParagraphDoc()
    expect(blockIndexForPos(doc, 25)).toBe(3)
  })

  test('out-of-range pos clamps: negative to 0, past-the-end to last index', () => {
    const doc = fourParagraphDoc()
    expect(blockIndexForPos(doc, -5)).toBe(0)
    expect(blockIndexForPos(doc, 10000)).toBe(3)
  })

  test('single-child doc: any pos returns index 0', () => {
    const doc = singleParagraphDoc()
    expect(blockIndexForPos(doc, 0)).toBe(0)
    expect(blockIndexForPos(doc, 3)).toBe(0)
    expect(blockIndexForPos(doc, 999)).toBe(0)
  })

  test('empty doc returns index 0', () => {
    expect(blockIndexForPos(emptyDocLike(), 0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// posForBlockIndex
// ---------------------------------------------------------------------------

describe('posForBlockIndex', () => {
  test('returns a position inside the child content, not the node boundary', () => {
    const doc = fourParagraphDoc()
    const pos = posForBlockIndex(doc, 1)
    // offset of child1 is 7; posForBlockIndex must land INSIDE it (>7), and
    // TextSelection.near/create at this position must resolve into the paragraph,
    // not sit at the boundary between child0 and child1.
    expect(pos).toBeGreaterThan(7)
    const resolved = doc.resolve(pos)
    expect(resolved.parent.type.name).toBe('paragraph')
    expect(resolved.parent.textContent).toBe('Second')
  })

  test('out-of-range index clamps: negative to first block, too-large to last block', () => {
    const doc = fourParagraphDoc()
    expect(posForBlockIndex(doc, -1)).toBe(posForBlockIndex(doc, 0))
    expect(posForBlockIndex(doc, 100)).toBe(posForBlockIndex(doc, 3))
  })

  test('single-child doc: any index clamps to the one child', () => {
    const doc = singleParagraphDoc()
    expect(posForBlockIndex(doc, 0)).toBe(posForBlockIndex(doc, 5))
  })

  test('empty doc returns pos 0', () => {
    expect(posForBlockIndex(emptyDocLike(), 0)).toBe(0)
  })

  // Math.max(0, Math.min(index, ...)) produces NaN for a NaN/non-integer/undefined
  // index, and children[NaN].offset then throws -- a real crash risk since
  // selectBlockIndex (a public MU-facing bridge entry point Swift calls directly) must
  // never throw across the JS/Swift bridge. A non-integer index degrades to the first
  // block (index 0) rather than throwing.
  test('NaN/undefined/non-integer index does not throw and degrades to the first block', () => {
    const doc = fourParagraphDoc()
    const firstBlockPos = posForBlockIndex(doc, 0)
    expect(() => posForBlockIndex(doc, NaN)).not.toThrow()
    expect(posForBlockIndex(doc, NaN)).toBe(firstBlockPos)
    expect(() => posForBlockIndex(doc, undefined)).not.toThrow()
    expect(posForBlockIndex(doc, undefined)).toBe(firstBlockPos)
    expect(() => posForBlockIndex(doc, 1.5)).not.toThrow()
    expect(posForBlockIndex(doc, 1.5)).toBe(firstBlockPos)
  })

  // This degrade path returns the same value (block 0) as a legitimate index-0 call,
  // so a real Swift-side bug would look identical to correct behavior. A console.warn
  // makes the degrade visible in the WKWebView inspector without changing the
  // never-throw return contract.
  test('NaN index warns via console.warn', () => {
    const doc = fourParagraphDoc()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    posForBlockIndex(doc, NaN)
    expect(warnSpy).toHaveBeenCalledOnce()
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// round-trip property: blockIndexForPos(doc, posForBlockIndex(doc, n)) === n
// ---------------------------------------------------------------------------

describe('blockIndexForPos / posForBlockIndex round-trip', () => {
  test('round-trips for every index in a multi-child doc', () => {
    const doc = fourParagraphDoc()
    for (let n = 0; n < doc.content.childCount; n++) {
      const pos = posForBlockIndex(doc, n)
      expect(blockIndexForPos(doc, pos)).toBe(n)
    }
  })

  test('round-trips for a single-child doc', () => {
    const doc = singleParagraphDoc()
    for (let n = 0; n < doc.content.childCount; n++) {
      const pos = posForBlockIndex(doc, n)
      expect(blockIndexForPos(doc, pos)).toBe(n)
    }
  })
})

// ---------------------------------------------------------------------------
// getSelectionBlockIndex / selectBlockIndex -- MU-facing wrappers
// ---------------------------------------------------------------------------

describe('getSelectionBlockIndex / selectBlockIndex', () => {
  let activeViewSpy

  beforeAll(() => {
    activeViewSpy = vi.spyOn(MU, 'activeView')
  })

  describe('getSelectionBlockIndex', () => {
    test('returns the block index containing the current selection', () => {
      const doc = fourParagraphDoc()
      activeViewSpy.mockReturnValue({ state: { doc, selection: { from: 15 } } })
      expect(getSelectionBlockIndex()).toBe(2)
    })

    test('returns null when there is no active view', () => {
      activeViewSpy.mockReturnValue(null)
      expect(getSelectionBlockIndex()).toBeNull()
    })
  })

  describe('selectBlockIndex', () => {
    test('dispatches a transaction with a selection at the start of the Nth block', () => {
      const doc = fourParagraphDoc()
      const state = EditorState.create({ doc })
      const dispatch = vi.fn()
      activeViewSpy.mockReturnValue({ state, dispatch })

      selectBlockIndex(1)

      expect(dispatch).toHaveBeenCalledTimes(1)
      const tr = dispatch.mock.calls[0][0]
      expect(tr.selection.from).toBe(posForBlockIndex(doc, 1))
    })

    test('no-ops without throwing when there is no active view', () => {
      activeViewSpy.mockReturnValue(null)
      expect(() => selectBlockIndex(0)).not.toThrow()
    })

    // selectBlockIndex is a public MU-facing bridge entry point Swift calls directly,
    // so a NaN index (e.g. a bad conversion on the Swift side) must degrade to a safe
    // dispatched selection, not throw across the bridge.
    test('NaN index does not throw and dispatches a selection at the first block', () => {
      const doc = fourParagraphDoc()
      const state = EditorState.create({ doc })
      const dispatch = vi.fn()
      activeViewSpy.mockReturnValue({ state, dispatch })

      expect(() => selectBlockIndex(NaN)).not.toThrow()

      expect(dispatch).toHaveBeenCalledTimes(1)
      const tr = dispatch.mock.calls[0][0]
      expect(tr.selection.from).toBe(posForBlockIndex(doc, 0))
    })

    // posForBlockIndex's `offset + 1` lands inside the wrapper node for
    // bullet_list/ordered_list/table/blockquote (whose inlineContent is false), not
    // inside a real textblock. prosemirror-state does NOT throw on this -- it emits a
    // global warn-once console.warn and constructs the selection anyway, so nothing
    // here fails loudly; the caret is just invisible/broken. Built from a REAL
    // makeParser doc (not another hand-built all-paragraph doc), so this actually
    // exercises non-textblock wrapper nodes, unlike an all-paragraph round-trip test.
    test('selectBlockIndex lands a valid TextSelection for every top-level node type, including non-textblock wrappers (list/table/blockquote)', () => {
      const md = [
        '# Heading',
        '',
        '- item one',
        '- item two',
        '',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '> quoted text',
        '',
      ].join('\n')
      const doc = makeParser(schema, makeWarnings()).parse(md)
      const state = EditorState.create({ doc })
      const dispatch = vi.fn()
      activeViewSpy.mockReturnValue({ state, dispatch })

      expect(doc.content.childCount).toBe(4) // heading, bullet_list, table, blockquote

      for (let n = 0; n < doc.content.childCount; n++) {
        dispatch.mockClear()
        expect(() => selectBlockIndex(n)).not.toThrow()
        expect(dispatch).toHaveBeenCalledTimes(1)
        const tr = dispatch.mock.calls[0][0]
        // A valid TextSelection must resolve into a genuine text-bearing node.
        expect(tr.selection.$from.parent.inlineContent, `block index ${n}`).toBe(true)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// topLevelBlockStarts
// ---------------------------------------------------------------------------

describe('topLevelBlockStarts', () => {
  test('one entry per top-level block across heading/paragraph/list/fence/blockquote/table', () => {
    const md = [
      '# Heading',
      '',
      'Paragraph.',
      '',
      '- item one',
      '- item two',
      '',
      '```',
      'fenced content',
      '```',
      '',
      '> blockquote text',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
    ].join('\n')
    const starts = topLevelBlockStarts(md)
    expect(starts).toHaveLength(6)
    expect(starts[0]).toBe(0) // heading
    expect(starts[1]).toBe(2) // paragraph
    expect(starts[2]).toBe(4) // bullet_list
    expect(starts[3]).toBe(7) // fence
    expect(starts[4]).toBe(11) // blockquote
    expect(starts[5]).toBe(13) // table
  })

  test('frontmatter counts as exactly one block: 3 entries, not 4', () => {
    const md = '---\ntitle: Test\nauthor: Me\n---\n\n# Heading\n\nPara.\n'
    const starts = topLevelBlockStarts(md)
    expect(starts).toHaveLength(3)
    expect(starts[0]).toBe(0) // front_matter
  })

  test('contiguous leading html blocks collapse into a single entry', () => {
    const md = [
      '<div>A</div>',
      '',
      '<div>B</div>',
      '',
      '# Heading',
      '',
      'Paragraph.',
      '',
    ].join('\n')
    const starts = topLevelBlockStarts(md)
    expect(starts).toHaveLength(3)
    expect(starts[0]).toBe(0) // collapsed leading html
    expect(starts[1]).toBe(4) // heading
    expect(starts[2]).toBe(6) // paragraph
  })

  test('a non-leading html block (after real content) is not collapsed away', () => {
    const md = [
      '# Heading',
      '',
      '<div>mid-doc</div>',
      '',
      'Paragraph.',
      '',
    ].join('\n')
    const starts = topLevelBlockStarts(md)
    expect(starts).toHaveLength(3)
    expect(starts[0]).toBe(0) // heading
    expect(starts[1]).toBe(2) // html_block, not leading so not collapsed with anything
    expect(starts[2]).toBe(4) // paragraph
  })

  test('empty markdown returns an empty array', () => {
    expect(topLevelBlockStarts('')).toEqual([])
  })

  // Same never-throw-across-the-bridge contract applies to markdownText itself, not
  // just numeric indices/offsets.
  test('null/undefined markdownText does not throw and returns an empty array', () => {
    expect(() => topLevelBlockStarts(null)).not.toThrow()
    expect(topLevelBlockStarts(null)).toEqual([])
    expect(() => topLevelBlockStarts(undefined)).not.toThrow()
    expect(topLevelBlockStarts(undefined)).toEqual([])
  })

  test('null markdownText warns via console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    topLevelBlockStarts(null)
    expect(warnSpy).toHaveBeenCalledOnce()
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// blockIndexAtOffset / offsetForBlockIndex
//
// OFFSET UNIT: offsets here are JS string indices, i.e. UTF-16 code units -- the
// native unit of a JS string's .length/.slice. This is not a stylistic choice; it
// falls out of the implementation (cumulative line.length + 1 summation), and it is
// the ONLY unit that composes cleanly with topLevelBlockStarts's line numbers, which
// are themselves derived from markdown-it token .map ranges over the same JS string.
// Swift's String.count is grapheme-cluster based and DIVERGES from UTF-16 code unit
// count on emoji/combining marks -- callers bridging these functions to Swift must
// convert via the UTF-16 view (NSString length / String.utf16), not Character count,
// or offsets will silently drift on any document containing non-BMP characters.
// ---------------------------------------------------------------------------

describe('blockIndexAtOffset / offsetForBlockIndex', () => {
  // Same 6-block fixture as topLevelBlockStarts's test above, reused so the
  // blank-line-belongs-to-no-block rule can be checked against known start
  // lines: heading=0, paragraph=2, bullet_list=4, fence=7, blockquote=11,
  // table=13. Line 10 (the blank line between the fence's closing ``` and
  // the blockquote) is covered by neither block's own map range.
  const sixBlockMd = [
    '# Heading',
    '',
    'Paragraph.',
    '',
    '- item one',
    '- item two',
    '',
    '```',
    'fenced content',
    '```',
    '',
    '> blockquote text',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
  ].join('\n')

  const frontmatterMd = '---\ntitle: Test\nauthor: Me\n---\n\n# Heading\n\nPara.\n'

  // Test-local, written independently of offsetForBlockIndex's own line-summation
  // logic, so it isn't just re-asserting the same code against itself.
  function charOffsetOfLine(text, lineNumber) {
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    let offset = 0
    for (let i = 0; i < lineNumber; i++) offset += lines[i].length + 1
    return offset
  }

  test('offsetForBlockIndex lands exactly on the block start line character offset', () => {
    expect(offsetForBlockIndex(sixBlockMd, 3)).toBe(charOffsetOfLine(sixBlockMd, 7)) // fence
    expect(offsetForBlockIndex(sixBlockMd, 4)).toBe(charOffsetOfLine(sixBlockMd, 11)) // blockquote
  })

  test('a blank line between blocks resolves to the preceding block, not the next one', () => {
    // Line 10 is the blank line between the fence (map [7,10]) and the
    // blockquote (map [11,12]) -- in no block's own range. Rule: the LAST
    // block whose start line <= this line, i.e. the fence (index 3), not
    // the blockquote (index 4).
    const offset = charOffsetOfLine(sixBlockMd, 10)
    expect(blockIndexAtOffset(sixBlockMd, offset)).toBe(3)
  })

  test('offset before the first block clamps to index 0', () => {
    expect(blockIndexAtOffset(sixBlockMd, -100)).toBe(0)
    expect(blockIndexAtOffset(sixBlockMd, 0)).toBe(0)
  })

  test('offset past the end clamps to the last block index', () => {
    expect(blockIndexAtOffset(sixBlockMd, sixBlockMd.length + 1000)).toBe(5)
  })

  test('offsetForBlockIndex clamps an out-of-range index to the first/last block', () => {
    expect(offsetForBlockIndex(sixBlockMd, -1)).toBe(offsetForBlockIndex(sixBlockMd, 0))
    expect(offsetForBlockIndex(sixBlockMd, 100)).toBe(offsetForBlockIndex(sixBlockMd, 5))
  })

  test('CRLF line endings are normalized before offset math', () => {
    const crlf = sixBlockMd.replace(/\n/g, '\r\n')
    expect(offsetForBlockIndex(crlf, 3)).toBe(charOffsetOfLine(crlf, 7))
    expect(blockIndexAtOffset(crlf, charOffsetOfLine(crlf, 10))).toBe(3)
  })

  test('a non-BMP character (emoji) in an earlier block does not throw off a later offset', () => {
    const md = [
      '# Heading with emoji \u{1F389}', // U+1F389 PARTY POPPER, a surrogate pair (2 UTF-16 code units)
      '',
      'Paragraph after the emoji block.',
      '',
    ].join('\n')
    const starts = topLevelBlockStarts(md)
    expect(starts).toEqual([0, 2])
    const paragraphOffset = offsetForBlockIndex(md, 1)
    expect(blockIndexAtOffset(md, paragraphOffset)).toBe(1)
    // The offset must land inside the actual paragraph text, confirming the
    // UTF-16-code-unit accounting for the emoji-containing heading line
    // wasn't skewed by one (which a naive code-point iteration would cause).
    expect(md.slice(paragraphOffset, paragraphOffset + 'Paragraph'.length)).toBe('Paragraph')
  })

  test('round-trips for every block index across multiple fixtures', () => {
    for (const md of [sixBlockMd, frontmatterMd, 'Only one paragraph.\n']) {
      const starts = topLevelBlockStarts(md)
      for (let n = 0; n < starts.length; n++) {
        const offset = offsetForBlockIndex(md, n)
        expect(blockIndexAtOffset(md, offset)).toBe(n)
      }
    }
  })

  // null/undefined markdownText must not throw either.
  test('null/undefined markdownText does not throw and degrades to 0', () => {
    expect(() => blockIndexAtOffset(null, 0)).not.toThrow()
    expect(blockIndexAtOffset(null, 0)).toBe(0)
    expect(() => blockIndexAtOffset(undefined, 0)).not.toThrow()
    expect(blockIndexAtOffset(undefined, 0)).toBe(0)
    expect(() => offsetForBlockIndex(null, 0)).not.toThrow()
    expect(offsetForBlockIndex(null, 0)).toBe(0)
    expect(() => offsetForBlockIndex(undefined, 0)).not.toThrow()
    expect(offsetForBlockIndex(undefined, 0)).toBe(0)
  })

  test('null markdownText warns via console.warn for both functions', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    blockIndexAtOffset(null, 0)
    offsetForBlockIndex(null, 0)
    expect(warnSpy).toHaveBeenCalledTimes(2)
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Composed capture/restore across a CHANGED document
//
// Every test above captures an offset and restores it against the SAME document.
// These cover the case where the document changes between capture and restore --
// offsetForBlockIndex against doc A, then blockIndexAtOffset against a DIFFERENT doc B
// (both a longer-than-A and a shorter-than-A case) -- confirming the result lands at a
// reasonable approximate location rather than crashing or producing something wildly
// wrong.
// ---------------------------------------------------------------------------

describe('composed capture/restore across a CHANGED document', () => {
  // 6 blocks: heading, paragraph, bullet_list, fence, blockquote, table.
  const docA = [
    '# Heading',
    '',
    'Paragraph.',
    '',
    '- item one',
    '- item two',
    '',
    '```',
    'fenced content',
    '```',
    '',
    '> blockquote text',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
  ].join('\n')

  test('doc B LONGER than doc A: an offset captured on A resolves to an in-range block on B, no throw', () => {
    const capturedIndex = 3 // the fence, mid-document in A
    const offsetFromA = offsetForBlockIndex(docA, capturedIndex)

    // docB: doc A with extra paragraphs inserted before and after -- strictly longer,
    // every original block has shifted to a higher line number/character offset.
    const docB = [
      'Extra paragraph one.',
      '',
      'Extra paragraph two.',
      '',
      docA,
      'Extra trailing paragraph.',
      '',
    ].join('\n')
    const startsB = topLevelBlockStarts(docB)

    expect(() => blockIndexAtOffset(docB, offsetFromA)).not.toThrow()
    const resolvedIndex = blockIndexAtOffset(docB, offsetFromA)
    expect(resolvedIndex).toBeGreaterThanOrEqual(0)
    expect(resolvedIndex).toBeLessThan(startsB.length)
  })

  test('doc B SHORTER than doc A: an offset captured on A (past the end of B) clamps to the last block on B, no throw', () => {
    const capturedIndex = 5 // the table, near the end of A
    const offsetFromA = offsetForBlockIndex(docA, capturedIndex)

    // docB: just the first two blocks of A -- strictly shorter; offsetFromA points well
    // past the end of docB's text.
    const docB = ['# Heading', '', 'Paragraph.', ''].join('\n')
    const startsB = topLevelBlockStarts(docB)
    expect(offsetFromA).toBeGreaterThan(docB.length)

    expect(() => blockIndexAtOffset(docB, offsetFromA)).not.toThrow()
    const resolvedIndex = blockIndexAtOffset(docB, offsetFromA)
    expect(resolvedIndex).toBeGreaterThanOrEqual(0)
    expect(resolvedIndex).toBeLessThan(startsB.length)
    // Specifically clamps to the LAST block, per blockIndexAtOffset's documented
    // out-of-range clamp behavior -- not 0, not an arbitrary value.
    expect(resolvedIndex).toBe(startsB.length - 1)
  })

  test('resolved index round-trips back through offsetForBlockIndex on the CHANGED doc without throwing or going out of range', () => {
    const capturedIndex = 3
    const offsetFromA = offsetForBlockIndex(docA, capturedIndex)
    const docB = ['# Only heading in B', ''].join('\n') // single-block doc, much shorter than A
    const resolvedIndex = blockIndexAtOffset(docB, offsetFromA)

    expect(() => offsetForBlockIndex(docB, resolvedIndex)).not.toThrow()
    const offsetInB = offsetForBlockIndex(docB, resolvedIndex)
    expect(offsetInB).toBeGreaterThanOrEqual(0)
    expect(offsetInB).toBeLessThanOrEqual(docB.length)
  })
})

// ---------------------------------------------------------------------------
// Consistency: topLevelBlockStarts(md).length === ProseMirror top-level
// childCount for the same md.
//
// topLevelBlockStarts (P2.1) mirrors, rather than shares code with,
// importMarkdown's normalization (src/markdown.js) -- a deliberate choice
// (see T2 design-source-doc-selection-toggle.md) made because importMarkdown
// is on the hot path for every file open/toggle and its preamble does text
// rewriting, a different job. This suite is the guard that keeps the mirror
// honest: it is the contract the two are not allowed to silently drift apart
// on.
//
// The ProseMirror side is built via the real parse path (makeParser, the
// same parser importMarkdown itself uses), not a hand-built doc.
//
// Frontmatter asymmetry: importMarkdown strips the YAML before calling
// makeParser, and Swift's MarkupDocument.seedMetadataBlock re-adds one
// metadata code_block afterward -- but ONLY when the YAML is non-empty.
// MarkupDocument.swift:331 is `guard !metadata.isEmpty else { return html }`,
// a conditional no-op, not an unconditional prepend -- makeParser itself
// never sees the frontmatter and never produces that block either way. So
// for a frontmatter fixture with non-empty YAML, the comparison is
// topLevelBlockStarts(mdWithFrontmatter).length ===
// makeParser(...).parse(bodyWithoutFrontmatter).content.childCount + 1 --
// but for YAML that parses to zero MetadataTuples (empty or comment-only),
// the +1 does NOT apply and the two sides diverge for the whole document;
// see the empty-frontmatter fixture below, which pins that divergence
// rather than asserting a rule that doesn't universally hold.
// ---------------------------------------------------------------------------

describe('topLevelBlockStarts / ProseMirror child count consistency', () => {
  function parseChildCount(md) {
    const doc = makeParser(schema, makeWarnings()).parse(md)
    return doc.content.childCount
  }

  // Splits YAML frontmatter off the front of `text`, mirroring (not calling)
  // importMarkdown's own detection -- test-local, so this suite isn't
  // silently validated against the same code it's meant to be checking.
  function splitFrontMatter(text) {
    const normalized = text.replace(/\r\n/g, '\n')
    const md = new MarkdownIt({ html: true })
    md.use(frontMatterPlugin, () => {})
    const tokens = md.parse(normalized, {})
    const fmToken = tokens.find(t => t.type === 'front_matter')
    if (!fmToken || !fmToken.map) return { body: normalized, hasFrontMatter: false }
    const lines = normalized.split('\n')
    return { body: lines.slice(fmToken.map[1]).join('\n'), hasFrontMatter: true }
  }

  // Collapses contiguous LEADING html_block tokens into a single fenced
  // ```html code_block, mirroring (not calling) importMarkdown's own
  // preamble (src/markdown.js) -- test-local, same rationale as
  // splitFrontMatter above. This is what the ProseMirror side actually
  // parses in production; calling makeParser on RAW text with leading html
  // (no collapse) exercises a path production never takes.
  function collapseLeadingHtml(text) {
    const normalized = text.replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    const md = new MarkdownIt({ html: true })
    md.use(frontMatterPlugin, () => {})
    const tokens = md.parse(normalized, {})

    let htmlStartLine = -1, htmlEndLine = -1
    for (const tok of tokens) {
      if (tok.type === 'front_matter' || tok.hidden) continue
      if (tok.type === 'html_block' && tok.map) {
        if (htmlStartLine === -1) htmlStartLine = tok.map[0]
        htmlEndLine = tok.map[1]
      } else {
        break
      }
    }
    if (htmlStartLine === -1) return normalized

    function lineOffset(i) {
      let off = 0
      for (let n = 0; n < i && n < lines.length; n++) off += lines[n].length + 1
      return off
    }
    const htmlContent = lines.slice(htmlStartLine, htmlEndLine).join('\n')
    const replacement = '```html\n' + htmlContent + '\n```\n'
    return normalized.slice(0, lineOffset(htmlStartLine)) + replacement + normalized.slice(lineOffset(htmlEndLine))
  }

  test('plain paragraphs', () => {
    const md = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n'
    expect(topLevelBlockStarts(md).length).toBe(parseChildCount(md))
  })

  test('headings', () => {
    const md = '# H1\n\n## H2\n\n### H3\n'
    expect(topLevelBlockStarts(md).length).toBe(parseChildCount(md))
  })

  test('fenced code block', () => {
    const md = '```js\nconst x = 1\n```\n'
    expect(topLevelBlockStarts(md).length).toBe(parseChildCount(md))
  })

  test('blockquote', () => {
    const md = '> Quoted text.\n> More quoted text.\n'
    expect(topLevelBlockStarts(md).length).toBe(parseChildCount(md))
  })

  test('table', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n'
    expect(topLevelBlockStarts(md).length).toBe(parseChildCount(md))
  })

  test('nested/tight list', () => {
    const md = '- one\n- two\n  - nested a\n  - nested b\n- three\n'
    expect(topLevelBlockStarts(md).length).toBe(parseChildCount(md))
  })

  test('mixed document (heading/paragraph/list/fence/blockquote/table), by count and by per-index type', () => {
    const md = [
      '# Heading',
      '',
      'Paragraph.',
      '',
      '- item one',
      '- item two',
      '',
      '```',
      'fenced content',
      '```',
      '',
      '> blockquote text',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
    ].join('\n')
    const starts = topLevelBlockStarts(md)
    const doc = makeParser(schema, makeWarnings()).parse(md)
    expect(doc.content.childCount).toBe(starts.length)

    const expectedTypes = ['heading', 'paragraph', 'bullet_list', 'code_block', 'blockquote', 'table']
    const actualTypes = []
    doc.content.forEach(node => actualTypes.push(node.type.name))
    expect(actualTypes).toEqual(expectedTypes)
  })

  test('frontmatter document: markdown block count equals (parsed body child count + 1) for the Swift-added metadata block', () => {
    const md = '---\ntitle: Test\nauthor: Me\n---\n\n# Heading\n\nPara.\n'
    const { body, hasFrontMatter } = splitFrontMatter(md)
    expect(hasFrontMatter).toBe(true)
    expect(topLevelBlockStarts(md).length).toBe(parseChildCount(body) + 1)
  })

  // The +1 above does NOT apply unconditionally. MarkupDocument.seedMetadataBlock
  // (MarkupEditorApp/Helpers/MarkupDocument.swift:331) is
  // `guard !metadata.isEmpty else { return html }` -- conditional, not an
  // unconditional prepend. importMarkdown (src/markdown.js) only sets
  // out.metadata when the extracted YAML is non-empty; for YAML that parses
  // to zero MetadataTuples (empty or comment-only), out.metadata stays
  // unset, seedMetadataBlock no-ops, and NO extra block is prepended --
  // while topLevelBlockStarts still counts the front_matter token, since
  // markdown-it-front-matter recognizes an empty frontmatter block just the
  // same as a populated one. Whole-document off-by-one, not pinned by either
  // existing frontmatter fixture above (both have non-empty YAML). Pinned
  // here rather than fixed.
  test('frontmatter with YAML that parses to zero metadata tuples: seedMetadataBlock no-ops, so the +1 does NOT apply (known divergent, whole-document off-by-one)', () => {
    const md = '---\n---\n\n# Heading\n\nPara.\n'
    const { body, hasFrontMatter } = splitFrontMatter(md)
    expect(hasFrontMatter).toBe(true)
    const starts = topLevelBlockStarts(md)
    const realChildCount = parseChildCount(body) // NOT + 1 -- no metadata block prepended
    expect(starts.length).toBe(3)
    expect(realChildCount).toBe(2)
    expect(starts.length).not.toBe(realChildCount) // pin the divergence itself
  })

  // Calling makeParser directly on RAW text with leading html (no pre-collapse)
  // exercises a path production never takes, since importMarkdown always collapses
  // contiguous LEADING html_block tokens into a single fenced code_block BEFORE
  // calling makeParser. Through the REAL pipeline the two sides align (3 === 3).
  test('leading raw HTML blocks: the REAL importMarkdown pipeline (collapsed to a fenced code_block before parsing) aligns with topLevelBlockStarts', () => {
    const md = [
      '<div>A</div>',
      '',
      '<div>B</div>',
      '',
      '# Heading',
      '',
      'Paragraph.',
      '',
    ].join('\n')
    const collapsed = collapseLeadingHtml(md)
    const starts = topLevelBlockStarts(md)
    const realChildCount = parseChildCount(collapsed)
    expect(starts.length).toBe(3) // collapsed html + heading + paragraph
    expect(realChildCount).toBe(3) // fenced code_block + heading + paragraph, via the real pipeline
    expect(realChildCount).toBe(starts.length) // aligns -- unlike raw makeParser on uncollapsed text
  })

  // importMarkdown ONLY collapses LEADING html_block tokens -- a mid-document or
  // trailing non-<img> html_block (a <div>, an HTML comment, a <pre>, anything but a
  // standalone <img>) goes straight to makeParser's own html_block handler
  // (src/parser.js), which produces a node ONLY for a standalone <img> and otherwise warns
  // and drops the block entirely (0 nodes). Every block AFTER the dropped one is off by
  // one for the rest of the document -- not local imprecision. Pinned rather than fixed.
  test('mid-document or trailing non-<img> html_block is dropped by makeParser, never collapsed by importMarkdown (known divergent, reachable in production)', () => {
    const cases = [
      ['mid-document <div>', '# H\n\n<div>x</div>\n\nP.\n'],
      ['trailing <div>', '# H\n\nP.\n\n<div>x</div>\n'],
      ['HTML comment', '# H\n\n<!-- c -->\n\nP.\n'],
      ['<pre> block', '# H\n\n<pre>x</pre>\n\nP.\n'],
    ]
    for (const [label, md] of cases) {
      const starts = topLevelBlockStarts(md)
      const childCount = parseChildCount(md)
      expect(starts.length, label).toBe(3)
      expect(childCount, label).toBe(2)
      expect(childCount, label).not.toBe(starts.length) // pin the divergence itself
    }

    // Contrast: a standalone <img> IS handled by makeParser's html_block handler
    // (src/parser.js special-cases it), so this shape does NOT diverge even without
    // importMarkdown's leading-only collapse.
    const imgMd = '# H\n\n<img src="x.png">\n\nP.\n'
    expect(topLevelBlockStarts(imgMd).length).toBe(3)
    expect(parseChildCount(imgMd)).toBe(3)
  })

  test('large realistic fixture (test-exporter.md): frontmatter-adjusted alignment', () => {
    const path = resolve(import.meta.dirname, '../../plugins/markupeditor-exporter-docx/test/fixtures/test-exporter.md')
    const md = readFileSync(path, 'utf-8')
    const { body, hasFrontMatter } = splitFrontMatter(md)
    expect(hasFrontMatter).toBe(true)
    const expectedCount = parseChildCount(body) + 1
    expect(topLevelBlockStarts(md).length).toBe(expectedCount)
  })
})

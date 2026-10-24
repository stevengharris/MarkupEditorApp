import { describe, test, expect } from 'vitest'
import { MU, EditorState } from 'markupeditor'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { describeBlocks } from '../src/doc-blocks.js'
import { isRelativeImageSrc, applyImagePolicy } from '../src/image-policy.js'
import { planReplace } from '../src/replace-blocks.js'

const { schema } = MU

const parse = (md) => makeParser(schema, makeWarnings()).parse(md)
const imagesIn = (node) => {
  const found = []
  node.descendants(n => { if (n.type.name === 'image') found.push(n) })
  return found
}
const linksIn = (node) => {
  const found = []
  node.descendants(n => {
    const mark = n.marks.find(m => m.type.name === 'link')
    if (mark) found.push({ text: n.text, href: mark.attrs.href })
  })
  return found
}

// ---------------------------------------------------------------------------
// what counts as a relative path
// ---------------------------------------------------------------------------

describe('isRelativeImageSrc', () => {
  test.each([
    'pic.png',
    './pic.png',
    '../up/pic.png',
    'images/pic.png',
    'images/my pic.png',
    'a.b.c/pic.png',
    'pic.png?v=2',
    'my pic.png',
  ])('%s is relative', (src) => {
    expect(isRelativeImageSrc(src)).toBe(true)
  })

  test.each([
    ['http://example.com/p.png', 'a web address'],
    ['https://example.com/p.png', 'a secure web address'],
    ['HTTPS://EXAMPLE.COM/P.PNG', 'a web address in capitals'],
    ['data:image/png;base64,AAAA', 'a data URL'],
    ['file:///Users/me/p.png', 'a file URL, which the app\'s own test would call local'],
    ['ftp://host/p.png', 'an ftp address'],
    ['javascript:alert(1)', 'a javascript URL'],
    ['blob:https://example.com/abc', 'a blob URL'],
    ['x-custom:thing', 'any other scheme'],
    ['//cdn.example.com/p.png', 'a protocol-relative address'],
    ['/Users/me/p.png', 'an absolute path'],
    ['\\\\server\\share\\p.png', 'a network path'],
    ['', 'an empty source'],
    ['   ', 'a blank source'],
    [' https://example.com/p.png', 'a web address after a space'],
    ['\thttp://example.com/p.png', 'a web address after a tab'],
    ['ht\ttp://example.com/p.png', 'a tab inside the scheme'],
    ['ht\ntp://example.com/p.png', 'a newline inside the scheme'],
    ['\t//cdn.example.com/p.png', 'a protocol-relative address after a tab'],
    ['\u0001https://example.com/p.png', 'a web address after a control character'],
    ['\n/Users/me/p.png', 'an absolute path after a newline'],
  ])('%j is not relative: %s', (src) => {
    expect(isRelativeImageSrc(src)).toBe(false)
  })

  test('a missing or non-string source is not relative', () => {
    expect(isRelativeImageSrc(null)).toBe(false)
    expect(isRelativeImageSrc(undefined)).toBe(false)
    expect(isRelativeImageSrc(5)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// the conversion
// ---------------------------------------------------------------------------

describe('applyImagePolicy', () => {
  test('a non-relative image becomes a link over its alt text', () => {
    const { fragment, warnings } = applyImagePolicy(parse('![a cat](https://example.com/cat.png)'), schema, new Set())
    expect(imagesIn(fragment)).toEqual([])
    expect(linksIn(fragment)).toEqual([{ text: 'a cat', href: 'https://example.com/cat.png' }])
    expect(fragment.textContent).toBe('a cat')
    expect(warnings).toEqual(['Image converted to a link because its source is not a relative path: https://example.com/cat.png'])
  })

  test('with no alt text the link is over the address', () => {
    const { fragment } = applyImagePolicy(parse('<img src="https://example.com/cat.png">'), schema, new Set())
    expect(linksIn(fragment)).toEqual([{ text: 'https://example.com/cat.png', href: 'https://example.com/cat.png' }])
  })

  test('a relative image is left alone, with its size', () => {
    const { fragment, warnings } = applyImagePolicy(parse('<img src="images/cat.png" alt="cat" width="30" height="40">'), schema, new Set())
    const [image] = imagesIn(fragment)
    expect(image.attrs).toMatchObject({ src: 'images/cat.png', alt: 'cat', width: 30, height: 40 })
    expect(warnings).toEqual([])
  })

  test.each([
    ['a data URL', '![x](data:image/png;base64,AAAA)'],
    ['an absolute path', '![x](/Users/me/p.png)'],
    ['a protocol-relative address', '![x](//cdn.example.com/p.png)'],
  ])('%s is converted', (_, md) => {
    const { fragment, warnings } = applyImagePolicy(parse(md), schema, new Set())
    expect(imagesIn(fragment)).toEqual([])
    expect(warnings.length).toBe(1)
  })

  test('every image syntax is covered: Markdown, reference style and a raw <img>', () => {
    const md = [
      '![inline](https://example.com/1.png)', '',
      '![reference][r]', '',
      '<img src="https://example.com/3.png" alt="raw">', '',
      '[r]: https://example.com/2.png',
    ].join('\n')
    const { fragment, warnings } = applyImagePolicy(parse(md), schema, new Set())
    expect(imagesIn(fragment)).toEqual([])
    expect(linksIn(fragment).map(l => l.href)).toEqual(['https://example.com/1.png', 'https://example.com/2.png', 'https://example.com/3.png'])
    expect(warnings.length).toBe(3)
  })

  test('an image inside text becomes a link inside the same paragraph', () => {
    const { fragment } = applyImagePolicy(parse('see <img src="https://example.com/p.png" alt="the chart"> for details'), schema, new Set())
    expect(fragment.textContent).toBe('see the chart for details')
    expect(fragment.childCount).toBe(1)
  })

  test('images inside a list, a quote and a table cell are converted too', () => {
    const md = [
      '* ![a](https://example.com/a.png)', '',
      '> ![b](https://example.com/b.png)', '',
      '| h |', '| --- |', '| ![c](https://example.com/c.png) |',
    ].join('\n')
    const { fragment, warnings } = applyImagePolicy(parse(md), schema, new Set())
    expect(imagesIn(fragment)).toEqual([])
    expect(linksIn(fragment).map(l => l.text)).toEqual(['a', 'b', 'c'])
    expect(warnings.length).toBe(3)
  })

  test('relative and remote images in the same fragment are told apart', () => {
    const { fragment } = applyImagePolicy(parse('![l](local.png)\n\n![r](https://example.com/r.png)'), schema, new Set())
    expect(imagesIn(fragment).map(i => i.attrs.src)).toEqual(['local.png'])
    expect(linksIn(fragment).map(l => l.href)).toEqual(['https://example.com/r.png'])
  })

  test('an image whose source is in the keep set is left alone', () => {
    const { fragment, warnings } = applyImagePolicy(parse('![mine](https://example.com/mine.png)'), schema, new Set(['https://example.com/mine.png']))
    expect(imagesIn(fragment).map(i => i.attrs.src)).toEqual(['https://example.com/mine.png'])
    expect(warnings).toEqual([])
  })

  test('the keep set matches the exact source, not a similar one', () => {
    const { fragment } = applyImagePolicy(parse('![x](https://example.com/mine.png?other)'), schema, new Set(['https://example.com/mine.png']))
    expect(imagesIn(fragment)).toEqual([])
  })

  test('the result is a valid document with the same number of blocks', () => {
    const original = parse('para\n\n![r](https://example.com/r.png)\n\n* item')
    const { fragment } = applyImagePolicy(original, schema, new Set())
    expect(fragment.childCount).toBe(original.childCount)
    expect(() => fragment.check()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// through replace_blocks
// ---------------------------------------------------------------------------

describe('the policy in replaceBlocks', () => {
  const stateOf = (document) => EditorState.create({ doc: document })
  const hashesFor = (document, index, count) => {
    const { blocks, firstEditable } = describeBlocks(document, {})
    return count > 0 ? blocks.slice(index, index + count).map(b => b.hash) : (index === firstEditable ? [] : [blocks[index - 1].hash])
  }
  const plan = (document, index, count, markdown) =>
    planReplace(stateOf(document), { index, count, markdown, expected: hashesFor(document, index, count), allowLoss: false })

  test('an assistant-written remote image arrives as a link and the warning is in the reply', () => {
    const document = parse('one\n\ntwo')
    const result = plan(document, 1, 1, '![chart](https://example.com/chart.png)')
    expect(result.ok, result.reason).toBe(true)
    expect(imagesIn(result.tr.doc)).toEqual([])
    expect(linksIn(result.tr.doc)).toEqual([{ text: 'chart', href: 'https://example.com/chart.png' }])
    expect(result.warnings).toEqual(['Image converted to a link because its source is not a relative path: https://example.com/chart.png'])
    expect(result.blocks[0].markdown).toBe('[chart](https://example.com/chart.png)')
  })

  test('replacing a block that holds a remote image keeps that image when the new Markdown has it too', () => {
    const document = parse('before\n\n![mine](https://example.com/mine.png)')
    const result = plan(document, 1, 1, 'A new caption\n\n![mine](https://example.com/mine.png)')
    expect(result.ok, result.reason).toBe(true)
    expect(imagesIn(result.tr.doc).map(i => i.attrs.src)).toEqual(['https://example.com/mine.png'])
    expect(result.warnings).toEqual([])
  })

  test('a different remote image in the same replace is still converted', () => {
    const document = parse('![mine](https://example.com/mine.png)')
    const result = plan(document, 0, 1, '![mine](https://example.com/mine.png)\n\n![theirs](https://example.com/theirs.png)')
    expect(imagesIn(result.tr.doc).map(i => i.attrs.src)).toEqual(['https://example.com/mine.png'])
    expect(linksIn(result.tr.doc).map(l => l.href)).toEqual(['https://example.com/theirs.png'])
    expect(result.warnings.length).toBe(1)
  })

  test('only images in the blocks being replaced are kept: the same image elsewhere in the document does not count', () => {
    const document = parse('![mine](https://example.com/mine.png)\n\nother\n\ntarget')
    const result = plan(document, 2, 1, '![mine](https://example.com/mine.png)')
    expect(imagesIn(result.tr.doc).filter(i => i.attrs.src.startsWith('https')).length).toBe(1)   // the one that was already at index 0
    expect(linksIn(result.tr.doc).map(l => l.href)).toEqual(['https://example.com/mine.png'])
  })

  test('an insert replaces nothing, so no remote image is kept', () => {
    const document = parse('![mine](https://example.com/mine.png)\n\nother')
    const result = plan(document, 1, 0, '![mine](https://example.com/mine.png)')
    expect(linksIn(result.tr.doc).length).toBe(1)
  })

  test('with restrictImages false a remote image stays an image and no warning is given', () => {
    const document = parse('one\n\ntwo')
    const result = planReplace(stateOf(document), {
      index: 1, count: 1, markdown: '![chart](https://example.com/chart.png)',
      expected: hashesFor(document, 1, 1), allowLoss: false, restrictImages: false,
    })
    expect(result.ok, result.reason).toBe(true)
    expect(imagesIn(result.tr.doc).map(i => i.attrs.src)).toEqual(['https://example.com/chart.png'])
    expect(result.warnings).toEqual([])
  })

  test('restrictImages true behaves as the default', () => {
    const document = parse('one\n\ntwo')
    const result = planReplace(stateOf(document), {
      index: 1, count: 1, markdown: '![chart](https://example.com/chart.png)',
      expected: hashesFor(document, 1, 1), allowLoss: false, restrictImages: true,
    })
    expect(imagesIn(result.tr.doc)).toEqual([])
    expect(result.warnings.length).toBe(1)
  })

  test('a relative image goes through untouched', () => {
    const result = plan(parse('a\n\nb'), 1, 1, '![local](images/pic.png)')
    expect(imagesIn(result.tr.doc).map(i => i.attrs.src)).toEqual(['images/pic.png'])
    expect(result.warnings).toEqual([])
  })
})

describe('sources the Markdown parser refuses', () => {
  test('a file URL never becomes an image: it stays literal text', () => {
    const { fragment } = applyImagePolicy(parse('![x](file:///Users/me/p.png)'), schema, new Set())
    expect(imagesIn(fragment)).toEqual([])
    expect(fragment.textContent).toBe('![x](file:///Users/me/p.png)')
  })
})

describe('an image inside a link', () => {
  test('the outer link keeps its destination and the image text becomes its label', () => {
    const { fragment, warnings } = applyImagePolicy(parse('[![Build](https://example.com/badge.png)](https://example.com/ci)'), schema, new Set())
    expect(imagesIn(fragment)).toEqual([])
    expect(linksIn(fragment)).toEqual([{ text: 'Build', href: 'https://example.com/ci' }])
    expect(warnings.length).toBe(1)
  })
})

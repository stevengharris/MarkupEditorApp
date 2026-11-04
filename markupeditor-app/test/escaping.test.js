import { describe, test, expect } from 'vitest'
import { MU } from 'markupeditor'
const { schema } = MU
import { makeSerializer } from '../src/serializer.js'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'

const parse = (md) => makeParser(schema, makeWarnings()).parse(md)
const serialize = (doc) => makeSerializer(makeWarnings()).serialize(doc, { escapeExtraCharacters: /</g })
const paragraph = (text) => schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text(text)])])

// What the text of a one-paragraph document reads back as after it is written and read again.
const readBack = (text) => parse(serialize(paragraph(text))).textContent

describe('escaping of ~ and brackets', () => {
  test('a lone tilde is written as it is', () => {
    expect(serialize(paragraph('About ~20 files'))).toBe('About ~20 files')
  })

  test('brackets that cannot start a link are written as they are', () => {
    expect(serialize(paragraph('and "[using nx pm init]" here'))).toBe('and "[using nx pm init]" here')
  })

  test('two tildes in a paragraph stay escaped, since they could strike text through', () => {
    expect(serialize(paragraph('~20 and ~30'))).toBe('\\~20 and \\~30')
    expect(serialize(paragraph('~~not struck~~'))).toBe('\\~\\~not struck\\~\\~')
  })

  test('brackets that could start a link or reference stay escaped', () => {
    expect(serialize(paragraph('[a](b)'))).toBe('\\[a\\](b)')
    expect(serialize(paragraph('[a][b]'))).toBe('\\[a\\]\\[b\\]')
  })

  test('brackets that look like a task box or a footnote stay escaped', () => {
    expect(serialize(paragraph('[ ] todo'))).toBe('\\[ \\] todo')
    expect(serialize(paragraph('[x] done'))).toBe('\\[x\\] done')
    expect(serialize(paragraph('see[^1]'))).toBe('see\\[^1\\]')
  })

  test('brackets in an image description stay escaped', () => {
    const image = schema.nodes.image.create({ src: 'a.png', alt: 'a]b' })
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [image])])
    expect(serialize(doc)).toBe('![a\\]b](a.png)')
  })

  test('the text reads back unchanged in every case', () => {
    for (const text of ['About ~20 files', '[using nx pm init]', '~20 and ~30', '~~x~~', '[a](b)', '[a][b]', '[ ] todo', 'see[^1]', 'a ~ b [c] ~', 'a\\[b', 'a\\~b', 'path\\to [x]']) {
      expect(readBack(text), text).toBe(text)
    }
  })
})

import { describe, test, expect } from 'vitest'
import { MU } from 'markupeditor'
const { schema } = MU
import { makeSerializer } from '../src/serializer.js'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'

function roundTrip(md) {
  const warnings = makeWarnings()
  const doc = makeParser(schema, warnings).parse(md)
  return makeSerializer(warnings).serialize(doc, { escapeExtraCharacters: /</g })
}

describe('list tightness on export', () => {
  test('a bullet list is written without blank lines between items', () => {
    expect(roundTrip('- one\n- two\n- three\n')).toBe('* one\n* two\n* three')
  })

  test('an ordered list is written without blank lines between items', () => {
    expect(roundTrip('1. one\n2. two\n')).toBe('1. one\n2. two')
  })

  test('a nested list stays tight', () => {
    expect(roundTrip('- one\n  - inner a\n  - inner b\n- two\n')).toBe('* one\n  * inner a\n  * inner b\n* two')
  })

  test('an item with two paragraphs makes its list loose', () => {
    expect(roundTrip('- one\n\n  more of one\n- two\n')).toBe('* one\n\n  more of one\n\n* two')
  })

  test('a tight list next to a loose one keeps each as it needs to be', () => {
    expect(roundTrip('- a\n- b\n\ntext\n\n- c\n\n  d\n- e\n')).toBe('* a\n* b\n\ntext\n\n* c\n\n  d\n\n* e')
  })

  test('a tight list after a paragraph is separated from it by one blank line', () => {
    expect(roundTrip('Intro\n\n- a\n- b\n')).toBe('Intro\n\n* a\n* b')
  })
})

import { describe, it, expect } from 'vitest'
import fixture from './fixtures/frontmatter.json' with { type: 'json' }
import { parseFrontmatterEntries } from '../src/metadata.js'

// The Swift YAMLMetadata parser runs the same cases (MarkupEditorAppTests/YAMLMetadataConformanceTests.swift).
describe('frontmatter conformance fixture', () => {
    it('has cases', () => {
        expect(fixture.cases.length).toBeGreaterThan(0)
    })

    it.each(fixture.cases.map((c) => [c.name, c]))('%s', (_name, { yaml, entries }) => {
        expect(parseFrontmatterEntries(yaml)).toEqual(entries)
    })
})

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isPluginsJson, validateEntry, groupedSections, hasAnyEntries } from './plugin-grid.js';

function withSuppressedWarnings(fn) {
  const originalWarn = console.warn;
  const calls = [];
  console.warn = (...args) => calls.push(args);
  try {
    return { result: fn(), calls };
  } finally {
    console.warn = originalWarn;
  }
}

const validEntry = {
  name: 'Mermaid',
  filename: 'markupeditor-codeview-mermaid.js',
  description: 'MarkupEditor codeview plugin for Mermaid diagrams.',
  author: 'Steven G. Harris <steven.g.harris@gmail.com>',
  version: '1.0.0',
  repo: 'https://github.com/stevengharris/markupeditor-desktop/tree/main/plugins/markupeditor-codeview-mermaid',
  source: 'https://raw.githubusercontent.com/stevengharris/markupeditor-desktop/main/plugins/markupeditor-codeview-mermaid/dist/markupeditor-codeview-mermaid.js',
};

test('isPluginsJson: true for a plain object', () => {
  assert.equal(isPluginsJson({ codeview: {}, exporter: {} }), true);
});

test('isPluginsJson: false for null, arrays, and primitives', () => {
  assert.equal(isPluginsJson(null), false);
  assert.equal(isPluginsJson(undefined), false);
  assert.equal(isPluginsJson([]), false);
  assert.equal(isPluginsJson('not json'), false);
  assert.equal(isPluginsJson(42), false);
});

test('validateEntry: true when name, description, author, version, repo are all non-empty strings', () => {
  assert.equal(validateEntry(validEntry), true);
});

test('validateEntry: false when a required field is missing', () => {
  for (const field of ['name', 'description', 'author', 'version', 'repo']) {
    const { [field]: _omit, ...rest } = validEntry;
    assert.equal(validateEntry(rest), false, `expected false with "${field}" missing`);
  }
});

test('validateEntry: false when a required field is present but not a string', () => {
  assert.equal(validateEntry({ ...validEntry, name: 123 }), false);
});

test('validateEntry: true even without ext, filename, or source (not needed for a browse card)', () => {
  const { filename: _f, source: _s, ...withoutInstallFields } = validEntry;
  assert.equal(validateEntry(withoutInstallFields), true);
});

test('validateEntry: false when repo is not an https:// URL', () => {
  assert.equal(validateEntry({ ...validEntry, repo: 'javascript:alert(1)' }), false);
  assert.equal(validateEntry({ ...validEntry, repo: 'http://example.com' }), false);
});

test('groupedSections: one section per type key present, in Object.entries order, entries preserved', () => {
  const data = {
    codeview: { Mermaid: validEntry },
    exporter: { DocX: { ...validEntry, name: 'DocX' } },
  };

  const sections = groupedSections(data);

  assert.deepEqual(
    sections.map((s) => s.type),
    ['codeview', 'exporter']
  );
  assert.deepEqual(sections[0].entries, [validEntry]);
  assert.deepEqual(sections[1].entries, [{ ...validEntry, name: 'DocX' }]);
});

test('groupedSections: does not hardcode "codeview"/"exporter" -- an arbitrary type key still gets its own section', () => {
  const data = { 'widget-type': { Widget: validEntry } };

  const sections = groupedSections(data);

  assert.deepEqual(sections, [{ type: 'widget-type', entries: [validEntry] }]);
});

test('groupedSections: a malformed entry is skipped, valid entries in the same section still render', () => {
  const data = {
    codeview: {
      Mermaid: validEntry,
      Broken: { name: 'Broken' },
    },
  };

  const { result: sections } = withSuppressedWarnings(() => groupedSections(data));

  assert.deepEqual(sections, [{ type: 'codeview', entries: [validEntry] }]);
});

test('groupedSections: a section with every entry malformed still appears, with an empty entries array', () => {
  const data = { codeview: { Broken: { name: 'Broken' } } };

  const { result: sections } = withSuppressedWarnings(() => groupedSections(data));

  assert.deepEqual(sections, [{ type: 'codeview', entries: [] }]);
});

test('groupedSections: warns when skipping a malformed entry', () => {
  const { calls } = withSuppressedWarnings(() =>
    groupedSections({ codeview: { Broken: { name: 'Broken' } } })
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /malformed/i);
});

test('groupedSections: a non-object type-level value yields an empty section instead of throwing, and warns', () => {
  const data = { codeview: null, exporter: { DocX: { ...validEntry, name: 'DocX' } } };

  const { result: sections, calls } = withSuppressedWarnings(() => groupedSections(data));

  assert.deepEqual(sections, [
    { type: 'codeview', entries: [] },
    { type: 'exporter', entries: [{ ...validEntry, name: 'DocX' }] },
  ]);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /malformed/i);
});

test('hasAnyEntries: false for no sections, or sections that are all empty', () => {
  assert.equal(hasAnyEntries([]), false);
  assert.equal(hasAnyEntries([{ type: 'codeview', entries: [] }]), false);
});

test('hasAnyEntries: true when at least one section has at least one entry', () => {
  assert.equal(
    hasAnyEntries([
      { type: 'codeview', entries: [] },
      { type: 'exporter', entries: [validEntry] },
    ]),
    true
  );
});

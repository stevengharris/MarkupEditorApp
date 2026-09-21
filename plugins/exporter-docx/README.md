# DocX Exporter

Converts the live MarkupEditor document to a DOCX file, via the `docx` npm package.

## Metadata

The document's YAML frontmatter can set the following DOCX core-properties. Each is only set
when the frontmatter actually has a value for it -- an untagged, unauthored document gets no
extra core-properties at all, not empty ones.

| Frontmatter field | DOCX core-property |
|---|---|
| `title` | Title |
| `creator` | Author |
| `description` | Description |
| `keywords` | Keywords (a list, written `[foo, bar]` or as `- item` lines, joins into one comma-separated value) |

Field names match `docx`'s `IPropertiesOptions` vocabulary directly (`creator`, `keywords`)
rather than a separate synonym set -- there's no translation layer to keep in sync. Any other
frontmatter field is ignored by this exporter.

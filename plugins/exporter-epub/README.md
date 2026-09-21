# EPUB Exporter

Converts the live MarkupEditor document to a spec-valid EPUB3 file, via `fflate` (a pure-JS
zip library).

## Metadata

Three frontmatter fields have dedicated fallback behavior:

| Frontmatter field | Behavior |
|---|---|
| `title` | Overrides the document's first heading. Without one, the first heading is used; without any heading either, falls back to "Untitled Document." |
| `language` (or `lang`) | Defaults to `en` when absent. |
| `identifier` | Replaces the freshly generated `urn:uuid:...`. A document that pins its identifier keeps a STABLE one across re-exports -- reading systems (Apple Books, calibre, etc.) use `dc:identifier` to recognize "same book, updated" rather than filing a duplicate. |

Every other frontmatter field whose name is a Dublin Core element (`contributor`, `coverage`,
`creator`, `date`, `description`, `format`, `publisher`, `relation`, `rights`, `source`,
`subject`, `type`) becomes `<dc:X>`, with one element per item for a list value
(`subject: [foo, bar]`, or `subject:` followed by `- item` lines, produces two `<dc:subject>`
elements). Any other field (`author`, `tags`, `draft`, ...) is skipped with a warning, because
the OPF schema rejects unknown `dc:` elements.

Common fields:

| Frontmatter field | EPUB OPF element |
|---|---|
| `creator` | `dc:creator` |
| `description` | `dc:description` |
| `date` | `dc:date` |
| `subject` | `dc:subject` (one per item, for a list) |

## Development

The plugin's name, type and extension come from the `markupeditor` block in `package.json`; `npm run build` writes `dist/exporter-epub.js` with that identity as its first line, and `npm test` rebuilds it and runs the suite, including the registration contract. See `skills/writing-markupeditor-plugins`.

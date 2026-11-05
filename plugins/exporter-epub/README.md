# EPUB Exporter

Export your MarkupEditor document as an e-book you can read on a phone, tablet, or e-reader.

EPUB is the most widely used e-book format. It is an open standard maintained by the W3C, and it opens in Apple Books, Kobo, calibre, and most other e-reading apps and devices. Unlike a PDF, an EPUB reflows to fit the screen, and the reader can change the font and size. This plugin adds **EPUB** to the app's File > Export menu, so you can write in Markdown and publish a book without leaving the MarkupEditor.

## Using the Plugin

1. Install **EPUB Exporter** from the Plugins tab in the app's right side panel.
2. Choose File > Export > EPUB.
3. Pick a name and location for the file. The name starts out as your document's name with `.epub` added.

The exported file reflects the document as it is in the editor, including any changes you have not saved. If anything could not be converted, the export still completes and each problem is reported in the app's side panel.

## What Is Included

Headings, paragraphs, bold, italic, underline, strikethrough, subscript, superscript, inline code, links, bulleted and numbered lists (including nested ones), tables, block quotes, code blocks, images, and horizontal rules all convert. The exporter builds a table of contents from your headings, so readers can jump between sections. If you have the [Mermaid plugin](https://github.com/stevengharris/MarkupEditorApp/tree/main/plugins/codeview-mermaid) installed, Mermaid diagrams are included as images.

## Document Fidelity

An EPUB cannot necessarily reproduce everything the editor shows. These are the differences worth knowing about.

### Images

The exporter embeds an image in the file when it can, so the book still shows it after you move or share it. How well that works depends on where the image lives:

* **Images on your Mac**, such as a file beside your document, are embedded. They keep their full resolution.
* **Images on the web**, whose address starts with `http://` or `https://`, are embedded only if the web site allows other pages to read its images, and many sites do not. The export also needs a network connection to fetch them.
* **An image that cannot be embedded** is replaced by a link containing its description and address, and the side panel says so. The reader sees the link in place of the picture.

Embedded images are stored as PNG, so an animated GIF becomes a still picture. Give every image a description, because e-readers use it for accessibility and show it when an image cannot be displayed.

### Links

Links to web addresses stay clickable, and so do links to a heading in the same document. The reader can follow them without leaving the book.

### Structure and appearance

* The whole document becomes one continuous chapter. The table of contents lists your headings, nested by level. A document with no headings gets a single entry named for the document.
* The book's title comes from your front matter, or from the first heading if the front matter has none. A document with neither is titled "Untitled Document".
* Appearance is left mostly to the reader's app. Fonts, size, and colors follow the reader's settings. The plugin adds only a light stylesheet for code blocks, block quotes, and table borders.
* Code uses the SF Mono font, which is on your Mac but not on most e-readers, so a reader substitutes a monospace font.
* There is no cover image, and the plugin does not split the book into separate chapter files.

### What gets skipped

Anything the exporter does not recognize is skipped, and the export still completes. Each problem is reported in the app's side panel, so it is worth a look after exporting a long document.

## Book Information

The YAML front matter at the top of your document is not exported as text. Its fields describe the book to the reader's app, which shows them in its library.

| Front matter field | What it does |
|---|---|
| `title` | The book's title. Without it, the first heading is used. |
| `language` (or `lang`) | The book's language, such as `en` or `fr`. Defaults to `en`. |
| `identifier` | A name for the book that stays the same each time you export it. Without one, every export is given a new random identifier, and apps such as Apple Books and calibre treat each export as a different book. Pin an `identifier` and a re-export is recognized as an update to the same book. |

Fields named for [Dublin Core](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/), a standard set of descriptive fields for publications, are also written into the book: `creator`, `contributor`, `date`, `description`, `publisher`, `rights`, `subject`, and the less common `coverage`, `format`, `relation`, `source`, and `type`. Write a field with several values as a list, either `[foo, bar]` or as `- item` lines, and each value is recorded separately. Any other field, such as `author` or `tags`, is skipped and reported in the side panel.

## How It Works

The plugin takes the HTML the editor is showing and converts it into the XHTML that EPUB 3 uses. It packs that, the images, the table of contents, and the book's information into the zip file layout the [EPUB 3 standard](https://www.w3.org/TR/epub-33/) requires, using the [fflate](https://github.com/101arrowz/fflate) library. Everything happens on your Mac, and your document is not sent anywhere. The only network use is fetching any web images in the document so they can be embedded.

## For Plugin Developers

This exporter is a reference implementation for the exporter plugin type, including its tests. To build or contribute a plugin of your own, see the [plugin developer documentation](https://github.com/stevengharris/MarkupEditorApp/blob/main/plugins/README.md). The source for this plugin is in this directory.

MIT licensed.

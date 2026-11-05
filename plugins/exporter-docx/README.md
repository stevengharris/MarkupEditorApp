# DocX Exporter

Export your MarkupEditor document as a Word file you can send to anyone.

A DOCX file is an open, ISO-standardized format that Microsoft Word uses and that other word processors, such as Pages, Google Docs, and LibreOffice, can open. This plugin adds **DocX** to the app's File > Export menu, so you can write in Markdown and hand someone a formatted document without leaving the MarkupEditor.

## Using the Plugin

1. Install **DocX Exporter** from the Plugins tab in the app's right side panel.
2. Choose File > Export > DocX.
3. Pick a name and location for the file. The name starts out as your document's name with `.docx` added.

The exported file reflects the document as it is in the editor, including any changes you have not saved. If anything could not be converted, the export still completes and each problem is reported in the app's side panel.

## What Is Included

Headings, paragraphs, bold, italic, underline, strikethrough, subscript, superscript, inline code, links, bulleted and numbered lists (including nested ones), tables, block quotes, code blocks, images, and horizontal rules all convert. If you have the [Mermaid plugin](https://github.com/stevengharris/MarkupEditorApp/tree/main/plugins/codeview-mermaid) installed, Mermaid diagrams are included as images. The exported pages are US Letter with one-inch margins.

## Document Fidelity

A DOCX file cannot necessarily reproduce everything the editor shows. These are the differences worth knowing about.

### Images

The exporter embeds an image in the file when it can, so the DOCX still shows it after you move or share it. How well that works depends on where the image lives:

* **Images on your Mac**, such as a file beside your document, are embedded. They keep their full resolution and are sized to match the width they have in the editor.
* **Images on the web**, whose address starts with `http://` or `https://`, are embedded only if the web site allows other pages to read its images, and many sites do not. The export also needs a network connection to fetch them.
* **An image that cannot be embedded** is replaced by a link containing its description and address, and the side panel says so. The reader sees the link in place of the picture.

Embedded images are stored as PNG, so an animated GIF becomes a still picture.

### Links

Links to web addresses and other documents stay clickable. The link's title text, if it has one, is dropped. A link to a heading in the same document keeps its text but is no longer a link, because the exported headings are not given anchors to point to.

### Styles and layout

* Code uses the SF Mono font, which is on your Mac but may not be on the machine that opens the file. A word processor without it substitutes another font.
* Tables keep the border style you chose in the editor.
* A heading inside a block quote keeps its heading style, but the quote's indent is not applied to it.
* Pages are US Letter. Choose a different paper size in your word processor after opening the file.

### What gets skipped

Anything the exporter does not recognize is skipped, and the export still completes. Each problem is reported in the app's side panel, so it is worth a look after exporting a long document.

## Document Properties

The YAML front matter at the top of your document is not exported as text. A few of its fields set the DOCX file's properties, which show up in the word processor's File > Properties (or Get Info) dialog. A property is only set when the front matter has a value for it.

| Front matter field | DOCX property |
|---|---|
| `title` | Title |
| `creator` | Author |
| `description` | Description |
| `keywords` | Keywords |

Write `keywords` as a list, either `[foo, bar]` or as `- item` lines, and they are joined into one comma-separated value. Any other front matter field is ignored.

## How It Works

The plugin takes the HTML the editor is showing and converts it, element by element, into the structure DOCX uses, which is a set of XML parts inside a zip file. It builds the file with the [docx](https://www.npmjs.com/package/docx) library, and the result follows the Office Open XML standard, [ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/). Everything happens on your Mac, and your document is not sent anywhere. The only network use is fetching any web images in the document so they can be embedded.

## For Plugin Developers

This exporter is a reference implementation for the exporter plugin type, including its tests. To build or contribute a plugin of your own, see the [plugin developer documentation](https://github.com/stevengharris/MarkupEditorApp/blob/main/plugins/README.md). The source for this plugin is in this directory.

MIT licensed.

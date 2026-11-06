# HTML Front Matter

An internal codeview plugin that renders an HTML block at the very start of a Markdown document live, instead of as HTML text. This is the "HTML front matter" a README often opens with, such as a centered logo or a row of badges.

It ships inside the app's Resources and is marked `internal` in `package.json`, so it is not listed in the plugin catalog and users never install or remove it. Only an `html` code block at the start of the document is rendered; if a metadata block comes first, the HTML block follows it. The HTML is sanitized with [DOMPurify](https://github.com/cure53/DOMPurify) before display, which removes scripts and event handlers.

Select the block to get **Source** and **Rendered** tabs.

See the [plugin developer documentation](../README.md) for the plugin contract, `package.json` metadata, building, and testing.

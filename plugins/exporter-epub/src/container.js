// META-INF/container.xml: the fixed entry point every EPUB reading system looks for first,
// pointing at the OPF package document. OEBPS/content.opf's path is a convention, not a spec
// requirement, but it's the one this exporter always uses, so this file never varies.
export const CONTAINER_XML =
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

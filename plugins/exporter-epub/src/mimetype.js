// Must be the FIRST entry in the zip, stored uncompressed (STORE, not DEFLATE), with no extra
// field -- getting this wrong (compressing it, or an extra field on its local header) is what
// makes some reading systems silently refuse an otherwise-valid EPUB. No trailing newline: the
// spec fixes this file's content exactly.
export const MIMETYPE = 'application/epub+zip'

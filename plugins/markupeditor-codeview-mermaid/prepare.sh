#!/bin/sh
set -e
npm run build
cp dist/markupeditor-codeview-mermaid.js ../../MarkupEditorApp/Resources/markupeditor-codeview-mermaid.js

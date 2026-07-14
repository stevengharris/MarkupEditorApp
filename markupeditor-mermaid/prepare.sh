#!/bin/sh
set -e
npm run build
cp dist/markupeditor-mermaid.js ../MarkupEditorApp/Resources/markupeditor-mermaid.js

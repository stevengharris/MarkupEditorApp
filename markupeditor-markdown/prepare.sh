#!/bin/sh
set -e
npm run build
cp dist/markup-editor-markdown.js ../MarkupEditorApp/Resources/markup-editor-markdown.js

#!/bin/sh
set -e
npm run build
cp dist/markupeditor-markdown.js ../MarkupEditorApp/Resources/markupeditor-markdown.js

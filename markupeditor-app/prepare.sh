#!/bin/sh
set -e
npm run build
cp dist/markupeditor-app.js ../MarkupEditorApp/Resources/markupeditor-app.js

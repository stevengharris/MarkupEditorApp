#!/bin/sh
set -e
npm run build
cp dist/markup-editor-markdown.js ../Resources/markup-editor-markdown.js

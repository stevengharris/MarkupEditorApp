#!/bin/bash
# Builds each npm project only when an input is newer than its output, so an unchanged build
# leaves dist untouched and nothing downstream is recopied or re-signed.
# Set FORCE=1 to rebuild everything.
set -e

root="$(cd "$(dirname "$0")" && pwd)"

projects=(
    markupeditor-app
    plugins/codeview-metadata
    plugins/codeview-htmlfrontmatter
    plugins/exporter-docx
    plugins/codeview-mermaid
    plugins/codeview-geojson
    plugins/exporter-epub
)

# True when the project's output is missing or older than anything it is built from: its own
# sources, the shared plugin-kit, or the installed dependencies.
stale() {
    local dir="$1"
    local out="$dir/dist/$(basename "$dir").js"
    [ -n "$FORCE" ] && return 0
    [ -e "$out" ] || return 0
    [ -n "$(find -L "$dir" "$root/plugin-kit" \( -name node_modules -o -name dist -o -name test -o -name '.vite*' \) -prune -o -type f -newer "$out" -print -quit)" ] && return 0
    [ -n "$(find -L "$root/package-lock.json" "$root/node_modules/.package-lock.json" "$root/node_modules/markupeditor/dist" -type f -newer "$out" -print -quit 2>/dev/null)" ] && return 0
    return 1
}

for project in "${projects[@]}"; do
    if stale "$root/$project"; then
        echo "Building $project"
        (cd "$root/$project" && npm run build)
    else
        echo "Up to date: $project"
    fi
done

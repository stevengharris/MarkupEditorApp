---
name: developing-markupeditorapp
description: Use when starting any work in the MarkupEditorApp repo -- fixing a bug, building a plugin, or anything else -- to understand how the three codebases behind it relate and what needs to be checked out locally before anything will build or test.
---

# Developing MarkupEditorApp

## Overview

MarkupEditorApp isn't one codebase -- it's three, layered, each owned by a different repo. Nothing here explains any one feature; it explains the shape you're working inside before you touch any of them.

## The Three Codebases, Outer to Inner

- **`markupeditor-base`** (JS/npm package) -- the actual editor, built on [ProseMirror](https://prosemirror.net/). Defines the ProseMirror schema (including the `code_block` node type every codeview plugin hooks into) and the `MU` namespace plugins call into (`MU.registerPlugin`, `MU.activeView()`, etc.).
- **`MarkupEditor`** (Swift package) -- wraps markupeditor-base's built JS bundle (`MarkupEditor/Resources/markup-editor.js`) inside a `WKWebView`-backed SwiftUI component (`MarkupWKWebView.swift`). This is also where macOS/iOS-native behavior that bypasses the DOM entirely lives -- e.g. native paste handling, covered in the plugin-authoring skills.
- **`MarkupEditorApp`** (this repo) -- the actual app. `plugins/` holds each plugin as its own independent npm package. `CodeViewManager`/`ExporterManager` (Swift, `MarkupEditorAppLib/Sources/MarkupEditorAppLib/`) install a plugin's built `dist/*.js` file into the app's runtime plugin directory and load it into the running `WKWebView` as a `userScript`.

That load-order fact -- plugins load into a `WKWebView` well after markupeditor-base's own editor already exists and has already rendered a document -- is the reason several patterns in the plugin-authoring skills look the way they do. If a pattern there seems arbitrary, it isn't; it's a consequence of arriving late.

## Setup

This repo is an npm workspace: a root `package.json` lists `markupeditor-app/` and each plugin under `plugins/` as members. Run `npm install` ONCE from the repo root -- not separately inside each directory -- which installs and hoists shared dependencies (like the `markupeditor` package itself) into a single `node_modules/` at the root, rather than a separate copy per member.

`markupeditor-base`'s own source is not needed as a local checkout to build or test this repo -- the published `markupeditor` npm package already carries its built output. Only clone `markupeditor-base` separately if you need to trace exact editor/ProseMirror behavior at the source level.

Every plugin has its own `markupeditor-sync.test.js`, which checks that the npm-installed `markupeditor` package matches the bundle `MarkupEditorApp` actually ships (`MarkupEditor/Resources/markup-editor.js`, read from a sibling `MarkupEditor` checkout if one is present -- the check skips itself if it isn't). If that test fails, run `npm update markupeditor` from the repo root first -- it usually means a newer version has already been published and this repo's install just hasn't picked it up yet.

## What to Read Next

- Fixing an app-level bug (Swift, SwiftUI, the app itself): no further skill needed -- read the relevant source directly.
- Building a plugin (any kind): **REQUIRED SUB-SKILL:** `writing-markupeditor-plugins`.

#!/usr/bin/env node
// Reads plugins/*/package.json and writes plugins/plugins.json.
// Run manually/locally after merging a plugin PR. No network call, no credentials.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// TEMPORARY host: MarkupEditorApp is currently a private repo, so
// raw.githubusercontent.com 404s against it. markupeditor-desktop is a
// confirmed-public stand-in used until MarkupEditorApp itself goes public.
// GITHUB_OWNER is permanent; GITHUB_REPO must revert to "MarkupEditorApp" once
// that happens. Both are named constants so the revert is a one-line change.
const GITHUB_OWNER = 'stevengharris';
const GITHUB_REPO = 'markupeditor-desktop';

const VALID_TYPES = new Set(['exporter', 'codeview']);

/**
 * Reads every plugins/<dir>/package.json under pluginsDir and derives the
 * PluginsJson structure. Throws before returning anything if any plugin
 * fails validation, naming the offending directory - the caller must never
 * receive a partial or wrong result.
 */
export async function loadPluginMetadata(pluginsDir) {
  const entries = await readdir(pluginsDir, { withFileTypes: true });
  const pluginDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const result = { codeview: {}, exporter: {} };
  const seenNames = { codeview: new Set(), exporter: new Set() };

  for (const dirName of pluginDirs) {
    const pkgPath = path.join(pluginsDir, dirName, 'package.json');
    let raw;
    try {
      raw = await readFile(pkgPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Not a plugin directory (e.g. test fixtures, tooling dirs) - matches
        // the "plugins/*/package.json" glob semantics, which skip these too.
        continue;
      }
      throw new Error(`Plugin "${dirName}": failed to read package.json: ${err.message}`);
    }

    let pkg;
    try {
      pkg = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Plugin "${dirName}": failed to parse package.json: ${err.message}`);
    }

    const md = pkg.markupeditor;
    if (!md || typeof md !== 'object') {
      throw new Error(`Plugin "${dirName}": package.json is missing the "markupeditor" object`);
    }
    if (!md.name) {
      throw new Error(`Plugin "${dirName}": markupeditor.name is missing`);
    }
    if (typeof md.name !== 'string') {
      throw new Error(`Plugin "${dirName}": markupeditor.name must be a string, got ${typeof md.name}`);
    }
    if (!md.type) {
      throw new Error(`Plugin "${dirName}": markupeditor.type is missing`);
    }
    if (!VALID_TYPES.has(md.type)) {
      throw new Error(
        `Plugin "${dirName}": markupeditor.type must be "exporter" or "codeview", got "${md.type}"`
      );
    }
    if (md.type === 'exporter') {
      if (!md.ext) {
        throw new Error(`Plugin "${dirName}": markupeditor.ext is required when type is "exporter"`);
      }
      if (typeof md.ext !== 'string') {
        throw new Error(`Plugin "${dirName}": markupeditor.ext must be a string, got ${typeof md.ext}`);
      }
      if (md.ext.startsWith('.')) {
        throw new Error(`Plugin "${dirName}": markupeditor.ext must not have a leading dot, got "${md.ext}"`);
      }
    }
    if (pkg.name !== dirName) {
      throw new Error(
        `Plugin "${dirName}": plugins/${dirName} directory name does not match package.json "name" ("${pkg.name}")`
      );
    }
    if (!pkg.main) {
      throw new Error(`Plugin "${dirName}": package.json is missing "main"`);
    }
    if (typeof pkg.main !== 'string') {
      throw new Error(`Plugin "${dirName}": package.json "main" must be a string, got ${typeof pkg.main}`);
    }
    for (const field of ['description', 'author', 'version']) {
      if (!pkg[field]) {
        throw new Error(`Plugin "${dirName}": package.json is missing "${field}"`);
      }
      if (typeof pkg[field] !== 'string') {
        throw new Error(
          `Plugin "${dirName}": package.json "${field}" must be a string, got ${typeof pkg[field]}`
        );
      }
    }

    const bucket = md.type;
    if (seenNames[bucket].has(md.name)) {
      throw new Error(`Plugin "${dirName}": duplicate name "${md.name}" within type "${bucket}"`);
    }
    seenNames[bucket].add(md.name);

    const filename = path.basename(pkg.main);
    const entry = {
      name: md.name,
      filename,
      ...(bucket === 'exporter' ? { ext: md.ext } : {}),
      description: pkg.description,
      author: pkg.author,
      version: pkg.version,
      repo: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tree/main/plugins/${dirName}`,
      source: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/plugins/${dirName}/${pkg.main}`,
    };

    result[bucket][md.name] = entry;
  }

  return result;
}

/** Writes data as pretty-printed JSON to outPath, creating parent directories as needed. */
export async function writePluginsJson(data, outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const pluginsDir = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(pluginsDir, 'plugins.json');

  const data = await loadPluginMetadata(pluginsDir);
  await writePluginsJson(data, outPath);
  console.log(`Wrote ${outPath}`);
}

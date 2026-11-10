#!/usr/bin/env node
// Creates plugins/<type>-<name>/ with the files every plugin needs and a stub that builds and
// passes its tests as generated.
//
//   npm run new-plugin -- --type exporter --name LaTeX --ext tex
//   npm run new-plugin -- --type codeview --name Graphviz

import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMarkupEditorBlock } from 'markupeditor-plugin-kit/manifest';

const NODE_RANGE = '^24.15.0';
const DEV_DEPENDENCIES = {
  jsdom: '^30.1.0',
  markupeditor: '^0.9.32',
  'markupeditor-plugin-kit': '*',
  rollup: '^4.31.0',
  vitest: '^5.1.0',
};

/** Lowercase, hyphen-separated form of a display name, used in the directory and file names. */
export function slugify(name) {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function pascalCase(slug) {
  return slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

function camelCase(slug) {
  const pascal = pascalCase(slug);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function packageJson({ dirName, type, name, ext, description, author }) {
  const markupeditor = type === 'exporter' ? { name, type, ext } : { name, type };
  return {
    name: dirName,
    version: '0.1.0',
    description,
    type: 'module',
    main: `dist/${dirName}.js`,
    license: 'MIT',
    author,
    engines: { node: NODE_RANGE },
    markupeditor,
    devDependencies: DEV_DEPENDENCIES,
    scripts: { build: 'rollup -c', test: 'vitest run' },
  };
}

function exporterSource({ name, slug }) {
  const pascal = pascalCase(slug);
  const camel = camelCase(slug);
  return `import { MU } from "markupeditor"
import pkg from "../package.json" with { type: "json" }
import { failureEnvelope, successEnvelope } from "markupeditor-plugin-kit/export"
import { stripMetadataBlock } from "markupeditor-plugin-kit/metadata"
import { registerExporter } from "markupeditor-plugin-kit/register"

export class ${pascal}Exporter {
    // Returns the envelope the app expects. This stub exports the document's HTML as UTF-8 text.
    async run() {
        const warnings = []
        try {
            const html = stripMetadataBlock(MU.getHTML())
            return successEnvelope(new TextEncoder().encode(html), warnings)
        } catch (error) {
            return failureEnvelope(warnings, ${JSON.stringify(name)}, error)
        }
    }
}

export const ${camel}Exporter = new ${pascal}Exporter()
registerExporter(pkg.markupeditor, { run: ${camel}Exporter.run.bind(${camel}Exporter) })
`;
}

function exporterTest({ name, slug, dirName }) {
  const camel = camelCase(slug);
  return `// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { MU } from 'markupeditor-plugin-kit/testing/stub'

MU.getHTML = vi.fn(() => '<p>hello</p>')
MU.registerPlugin = vi.fn()
const { ${camel}Exporter } = await import('../dist/${dirName}.js')

describe(${JSON.stringify(`${name} exporter`)}, () => {
    it('exports the document', async () => {
        const envelope = JSON.parse(await ${camel}Exporter.run())
        expect(Buffer.from(envelope.result, 'base64').toString()).toContain('hello')
    })
})
`;
}

function codeviewSource({ slug }) {
  const pascal = pascalCase(slug);
  const camel = camelCase(slug);
  return `import { MU } from "markupeditor"
import pkg from "../package.json" with { type: "json" }
import { registerCodeView } from "markupeditor-plugin-kit/register"

const LANGUAGE = ${JSON.stringify(slug)}

export class ${pascal}Plugin {
    install() {
        const view = MU.activeView()
        if (!view) return

        // Wrap the factory installed now, so other codeview plugins keep working.
        const original = view.props.nodeViews.code_block
        const codeBlockFactory = (node, editorView, getPos) => {
            if (node.attrs.language === LANGUAGE) {
                // Return a NodeView for the block here.
            }
            return original(node, editorView, getPos)
        }
        view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: codeBlockFactory } })

        // Registering makes the language available in the Language dialog.
        registerCodeView(pkg.markupeditor)
    }
}

export const ${camel}Plugin = new ${pascal}Plugin()

${camel}Plugin.install()
`;
}

const CONTRACT_TEST = `// @vitest-environment jsdom
import path from 'node:path'
import { registrationContract } from 'markupeditor-plugin-kit/testing/contract'

registrationContract(path.resolve(import.meta.dirname, '..'))
`;

/**
 * Creates the plugin directory under pluginsDir and returns its name and the files written, relative
 * to the directory. Throws, writing nothing, when the arguments are invalid or the directory exists.
 */
export async function scaffoldPlugin({ pluginsDir, type, name, ext, description, author }) {
  if (type !== 'exporter' && type !== 'codeview') throw new Error('--type must be "exporter" or "codeview"');
  if (!name || !name.trim()) throw new Error('--name is required');
  name = name.trim();
  const slug = slugify(name);
  if (!slug || !/^[a-z]/.test(slug)) throw new Error('--name must start with a letter');
  if (type === 'exporter') {
    ext = (ext ?? slug.replace(/-/g, '')).trim();
    if (!/^[a-z0-9]+$/.test(ext)) throw new Error('--ext must be lowercase letters and digits, with no leading dot');
  } else {
    ext = undefined;
  }
  const dirName = `${type}-${slug}`;
  const dir = path.join(pluginsDir, dirName);
  if (existsSync(dir)) throw new Error(`${dirName} already exists`);

  const pkg = packageJson({
    dirName, type, name, ext, author: author || 'Your Name <you@example.com>',
    description: description || (type === 'exporter' ? `Export to ${name} format.` : `Render a ${name} code block.`),
  });
  validateMarkupEditorBlock(pkg.markupeditor, `Plugin "${dirName}"`);

  const context = { name, slug, dirName };
  const files = {
    'package.json': `${JSON.stringify(pkg, null, 2)}\n`,
    'rollup.config.mjs': `import { pluginConfig } from 'markupeditor-plugin-kit/rollup'\n\nexport default pluginConfig(import.meta.dirname, { input: 'src/${slug}.js' })\n`,
    'vitest.config.js': `import { pluginVitestConfig } from 'markupeditor-plugin-kit/testing'\n\nexport default pluginVitestConfig({ dist: true })\n`,
    [`src/${slug}.js`]: type === 'exporter' ? exporterSource(context) : codeviewSource(context),
    'test/registration-contract.test.js': CONTRACT_TEST,
    'README.md': `# ${name}\n\nSay what this plugin does and how to use it.\n`,
  };
  if (type === 'exporter') files[`test/${slug}.test.js`] = exporterTest(context);

  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dir, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, 'utf8');
  }
  return { dirName, files: Object.keys(files) };
}

function gitConfig(key) {
  try {
    return execFileSync('git', ['config', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag.startsWith('--') || i + 1 >= argv.length) throw new Error(`Unexpected argument: ${flag}`);
    out[flag.slice(2)] = argv[i + 1];
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const pluginsDir = path.dirname(fileURLToPath(import.meta.url));
    const gitName = gitConfig('user.name');
    const gitEmail = gitConfig('user.email');
    const author = args.author || (gitName ? (gitEmail ? `${gitName} <${gitEmail}>` : gitName) : '');
    const { dirName } = await scaffoldPlugin({ pluginsDir, ...args, author });
    console.log(`Created plugins/${dirName}\n\nNext, from the repository root:\n  npm install\n  cd plugins/${dirName}\n  npm run build\n  npm test`);
  } catch (error) {
    console.error(`${error.message}\n\nUsage: npm run new-plugin -- --type <exporter|codeview> --name <Name> [--ext <ext>] [--description <text>] [--author <text>]`);
    process.exit(1);
  }
}

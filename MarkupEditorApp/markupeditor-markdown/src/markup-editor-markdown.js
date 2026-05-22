import { Schema, DOMSerializer } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'
import { addListNodes } from 'prosemirror-schema-list'
import OrderedMap from 'orderedmap'
import { makeSerializer } from './serializer.js'
import { makeParser } from './parser.js'
import { makeWarnings } from './warnings.js'

// ---------------------------------------------------------------------------
// Schema (mirrors markupeditor-base/src/schema/index.js exactly)
// ---------------------------------------------------------------------------

const pDOM = ['p', 0]
const blockquoteDOM = ['blockquote', 0]
const hrDOM = ['hr']
const preDOM = ['pre', ['code', 0]]
const brDOM = ['br']

let baseNodes = OrderedMap.from({
  doc: {
    content: 'block+'
  },

  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM() { return pDOM }
  },

  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM() { return blockquoteDOM }
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM() { return hrDOM }
  },

  heading: {
    attrs: {
      id: { default: null },
      level: { default: 1 }
    },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h1', getAttrs(dom) { return { level: 1, id: dom.getAttribute('id') } } },
      { tag: 'h2', getAttrs(dom) { return { level: 2, id: dom.getAttribute('id') } } },
      { tag: 'h3', getAttrs(dom) { return { level: 3, id: dom.getAttribute('id') } } },
      { tag: 'h4', getAttrs(dom) { return { level: 4, id: dom.getAttribute('id') } } },
      { tag: 'h5', getAttrs(dom) { return { level: 5, id: dom.getAttribute('id') } } },
      { tag: 'h6', getAttrs(dom) { return { level: 6, id: dom.getAttribute('id') } } }
    ],
    toDOM(node) {
      return ['h' + node.attrs.level, { id: node.attrs.id }, 0]
    }
  },

  code_block: {
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
    toDOM() { return preDOM }
  },

  text: {
    group: 'inline'
  },

  image: {
    inline: true,
    attrs: {
      src: {},
      alt: { default: null },
      width: { default: null },
      height: { default: null }
    },
    group: 'inline',
    parseDOM: [{
      tag: 'img[src]',
      getAttrs(dom) {
        const width = dom.getAttribute('width') && parseInt(dom.getAttribute('width'))
        const height = dom.getAttribute('height') && parseInt(dom.getAttribute('height'))
        return {
          src: dom.getAttribute('src'),
          alt: dom.getAttribute('alt'),
          width: width,
          height: height
        }
      }
    }],
    toDOM(node) {
      const { src, alt, width, height } = node.attrs
      const minAttrs = {}
      minAttrs.src = src
      if (alt) minAttrs.alt = alt
      if (width) minAttrs.width = width
      if (height) minAttrs.height = height
      return ['img', minAttrs]
    }
  },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM() { return brDOM }
  },

  div: {
    content: 'block*',
    group: 'block',
    isolating: true,
    selectable: false,
    attrs: {
      id: { default: null },
      parentId: { default: 'editor' },
      cssClass: { default: null },
      editable: { default: true },
      htmlContents: { default: null },
      spellcheck: { default: false },
      autocorrect: { default: 'on' },
      autocapitalize: { default: 'off' },
      writingsuggestions: { default: false }
    },
    parseDOM: [{
      style: 'div[id, class, parentId]',
      getAttrs(dom) {
        return {
          id: dom.getAttribute('id'),
          parentId: dom.getAttribute('parentId'),
          cssClass: dom.getAttribute('class'),
          editable: dom.getAttribute('editable') === 'true',
          spellcheck: dom.getAttribute('spellcheck') === 'true',
          autocorrect: dom.getAttribute('autocorrect') === 'on',
          autocapitalize: dom.getAttribute('autocapitalize') === 'on',
          writingsuggestions: dom.getAttribute('writingsuggestions') === 'true',
          htmlContents: dom.innerHTML ?? ''
        }
      }
    }],
    toDOM(node) {
      const { id, cssClass } = node.attrs
      return ['div', { id: id, class: cssClass }, 0]
    }
  },

  button: {
    content: 'text*',
    group: 'block',
    attrs: {
      id: { default: null },
      parentId: { default: null },
      cssClass: { default: null },
      label: { default: '' }
    },
    parseDOM: [{
      tag: 'button',
      getAttrs(dom) {
        return {
          id: dom.getAttribute('id'),
          parentId: dom.getAttribute('parentId'),
          cssClass: dom.getAttribute('class'),
          label: dom.innerHTML ?? ''
        }
      }
    }],
    toDOM(node) {
      const { id, cssClass, label } = node.attrs
      const button = document.createElement('button')
      if (id) button.setAttribute('id', id)
      if (cssClass) button.setAttribute('class', cssClass)
      button.setAttribute('type', 'button')
      if (label) button.innerHTML = label
      return button
    }
  }
})

// Mix list nodes
baseNodes = addListNodes(baseNodes, '(paragraph | heading)+ block*', 'block')

// Create table nodes
const tNodes = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    background: {
      default: null,
      getFromDOM(dom) {
        return dom.style.backgroundColor || null
      },
      setDOMAttr(value, attrs) {
        if (value)
          attrs.style = (attrs.style || '') + `background-color: ${value};`
      }
    }
  }
})
tNodes.table.attrs = { class: { default: null } }
tNodes.table.parseDOM = [{
  tag: 'table',
  getAttrs(dom) {
    return { class: dom.getAttribute('class') }
  }
}]
tNodes.table.toDOM = (node) => ['table', node.attrs, 0]

const nodes = baseNodes.append(tNodes)

const emDOM = ['em', 0]
const strongDOM = ['strong', 0]
const codeDOM = ['code', 0]
const strikeDOM = ['s', 0]
const uDOM = ['u', 0]
const subDOM = ['sub', 0]
const supDOM = ['sup', 0]

const marks = {
  link: {
    attrs: {
      href: {},
      title: { default: null }
    },
    inclusive: false,
    parseDOM: [{
      tag: 'a[href]',
      getAttrs(dom) {
        return { href: dom.getAttribute('href'), title: dom.getAttribute('title') }
      }
    }],
    toDOM(node) {
      const { href, title } = node.attrs
      return ['a', { href, title }, 0]
    }
  },

  em: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
    toDOM() { return emDOM }
  },

  s: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
    toDOM() { return strikeDOM }
  },

  u: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM() { return uDOM }
  },

  sub: {
    parseDOM: [{ tag: 'sub' }, { style: 'vertical-align: sub' }],
    toDOM() { return subDOM }
  },

  sup: {
    parseDOM: [{ tag: 'sup' }, { style: 'vertical-align: super' }],
    toDOM() { return supDOM }
  },

  strong: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: node => node.style.fontWeight !== 'normal' && null },
      { style: 'font-weight', getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null }
    ],
    toDOM() { return strongDOM }
  },

  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM() { return codeDOM }
  }
}

const schema = new Schema({ nodes, marks })

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

const MU = document.querySelector('markup-editor').MU

/**
 * Export the active editor content as Markdown.
 *
 * @param {string} _content - unused; content comes from the active view
 * @returns {string} JSON string { result: string|null, warnings: string[] }
 */
function exportFn(_content) {
  const view = MU.activeView()
  if (!view) {
    return JSON.stringify({ result: null, warnings: ['No active view'] })
  }
  const doc = view.state.doc
  const warnings = makeWarnings()
  const serializer = makeSerializer(warnings)
  const markdown = serializer.serialize(doc)
  return JSON.stringify({ result: markdown, warnings: warnings.get() })
}

/**
 * Import Markdown content, converting it to HTML for the editor.
 *
 * @param {string} content - Markdown string to import
 * @returns {string} JSON string { result: string|null, warnings: string[] }
 */
function importFn(content) {
  const warnings = makeWarnings()
  const parser = makeParser(schema, warnings)
  const doc = parser.parse(content)
  const serializer = DOMSerializer.fromSchema(schema)
  const div = document.createElement('div')
  div.appendChild(serializer.serializeFragment(doc.content))
  return JSON.stringify({ result: div.innerHTML, warnings: warnings.get() })
}

MU.registerPlugin({
  id: 'markdown',
  name: 'Markdown',
  extension: 'md',
  export: exportFn,
  import: importFn
})

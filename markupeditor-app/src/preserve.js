import { MarkdownSerializerState } from 'prosemirror-markdown'
import { makeSerializer } from './serializer.js'
import { makeWarnings } from './warnings.js'
import { describeBlocks } from './doc-blocks.js'

const terminatorOf = (text) => text.match(/\r?\n$/)?.[0] ?? ''

/**
 * Pair baseline blocks with current blocks by hash. The common prefix and suffix pair off directly; the
 * middle pairs by longest common subsequence, preferring pairs close in position when equal blocks repeat.
 * Blocks that cannot be preserved never pair.
 *
 * @param {Array<{baseline: string, preservable: boolean}>} base
 * @param {Array<{hash: string}>} current
 * @returns {Map<number, number>} current index -> baseline index
 */
export function matchBlocks(base, current) {
  const pairs = new Map()
  const same = (i, j) => base[i].preservable && base[i].baseline === current[j].hash
  let lo = 0
  while (lo < base.length && lo < current.length && same(lo, lo)) { pairs.set(lo, lo); lo++ }
  let bi = base.length, ci = current.length
  while (bi > lo && ci > lo && same(bi - 1, ci - 1)) { bi--; ci--; pairs.set(ci, bi) }

  const n = bi - lo, m = ci - lo
  if (n === 0 || m === 0) return pairs
  // Score a match as one point of weight K minus its distance, so the count dominates and distance breaks ties.
  const K = n * m + 1
  const width = m + 1
  const table = new Float64Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      let best = Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
      if (same(lo + i, lo + j)) best = Math.max(best, K - Math.abs(i - j) + table[(i + 1) * width + j + 1])
      table[i * width + j] = best
    }
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    const here = table[i * width + j]
    if (same(lo + i, lo + j) && here === K - Math.abs(i - j) + table[(i + 1) * width + j + 1]) {
      pairs.set(lo + j, lo + i)
      i++; j++
    } else if (here === table[(i + 1) * width + j]) {
      i++
    } else {
      j++
    }
  }
  return pairs
}

/**
 * Serialize `doc` to Markdown, keeping the original lines of every block that is unchanged since `map`
 * was recorded. Output starts at the first block; front matter is not included.
 *
 * @param {object} doc - ProseMirror doc Node
 * @param {object} map - the recorded source map
 * @param {object} warnings - warnings collector from makeWarnings()
 * @returns {string|null} null when no block matches, which means the map belongs to some other content
 */
export function preserveMarkdown(doc, map, warnings) {
  const described = describeBlocks(doc)
  const first = described.blocks[0]?.kind === 'metadata' ? 1 : 0
  const current = described.blocks.slice(first)
  const pairs = matchBlocks(map.blocks, current)
  if (pairs.size === 0) return null
  const eol = map.lineEnding === 'CRLF' ? '\r\n' : '\n'

  const parts = current.map((block, j) => {
    const i = pairs.get(j)
    if (i === undefined) return { text: block.markdown.replace(/\n/g, eol), term: eol, base: -1 }
    const raw = map.lines.slice(map.blocks[i].startLine, map.blocks[i].endLine).join('')
    const term = terminatorOf(raw)
    return { text: raw.slice(0, raw.length - term.length), term, base: i }
  })

  // Text outside the first and last blocks survives only if the block next to it does. Front matter and
  // the gap after it belong to the caller, so leading text exists only when there is no front matter.
  const lastBase = map.blocks.length - 1
  const leading = map.frontMatter === null ? map.lines.slice(0, map.blocks[0].startLine).join('') : ''
  const trailing = map.lines.slice(map.blocks[lastBase].endLine).join('')
  const keepLeading = parts[0]?.base === 0
  const keepTrailing = parts[parts.length - 1]?.base === lastBase
  if (!keepLeading && leading.trim()) warnings.add('Text before the first block was dropped because that block was edited')
  if (!keepTrailing && trailing.trim()) warnings.add('Text after the last block was dropped because that block was edited')

  const keptGaps = new Set()
  let out = keepLeading ? leading : ''
  parts.forEach((part, j) => {
    out += part.text
    const next = parts[j + 1]
    if (!next) {
      if (keepTrailing && trailing) out += part.term + trailing
      else if (map.finalNewline) out += part.term || eol
    } else if (part.base >= 0 && next.base === part.base + 1) {
      out += part.term + map.lines.slice(map.blocks[part.base].endLine, map.blocks[next.base].startLine).join('')
      keptGaps.add(part.base)
    } else {
      out += (part.term || eol) + eol
    }
  })
  warnOnDroppedGaps(map, keptGaps, warnings)
  return out
}

const DEFINITION = /^ {0,3}\[([^\]]+)\]:/

// Gap text between two original blocks is lost when the blocks are no longer adjacent matches.
function warnOnDroppedGaps(map, keptGaps, warnings) {
  for (let i = 0; i + 1 < map.blocks.length; i++) {
    if (keptGaps.has(i)) continue
    const gap = map.lines.slice(map.blocks[i].endLine, map.blocks[i + 1].startLine)
    const other = []
    for (const line of gap) {
      const label = line.match(DEFINITION)?.[1]
      if (label) warnings.add(`Link reference definition was not saved: ${label}`)
      else other.push(line)
    }
    const text = other.join('').trim()
    if (text) warnings.add(`Raw HTML next to an edited block was not saved: ${text.slice(0, 60).trim()}`)
  }
}

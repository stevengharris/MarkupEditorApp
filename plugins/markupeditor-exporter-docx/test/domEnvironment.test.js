// @vitest-environment happy-dom
//
// Narrowly-scoped DOM environment: only this file pays the DOM-parsing cost, so
// styles.test.js and other byte/string tests keep running in vitest's fast default node
// environment. Probes real parsing behavior for the two shapes the converter cannot afford
// to get wrong -- whitespace inside <pre> is real content, and colspan/rowspan drive actual
// cell merging -- rather than assuming happy-dom handles them faithfully.
import { describe, it, expect } from 'vitest'

describe('happy-dom DOMParser fidelity', () => {
    it('preserves whitespace exactly inside <pre><code> nested in a <blockquote>', () => {
        const html = '<blockquote><pre><code class="language-swift">  let x = 1\n    let y = 2\n</code></pre></blockquote>'
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const code = doc.querySelector('code')
        expect(code.textContent).toBe('  let x = 1\n    let y = 2\n')
        expect(code.getAttribute('class')).toBe('language-swift')
    })

    it('reads colspan and rowspan off a parsed table cell', () => {
        const html = '<table><tr><td colspan="2" rowspan="3">merged</td></tr></table>'
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const cell = doc.querySelector('td')
        expect(cell.getAttribute('colspan')).toBe('2')
        expect(cell.getAttribute('rowspan')).toBe('3')
    })

    it('distinguishes table_header (<th>) from table_cell (<td>)', () => {
        const html = '<table><tr><th colspan="2">head</th><td>cell</td></tr></table>'
        const doc = new DOMParser().parseFromString(html, 'text/html')
        expect(doc.querySelector('th').tagName).toBe('TH')
        expect(doc.querySelector('td').tagName).toBe('TD')
        expect(doc.querySelector('th').getAttribute('colspan')).toBe('2')
    })
})

import { LevelFormat, AlignmentType } from 'docx'

// Word's convention: 9 levels, 720-twip indent step per level.
export const LEVEL_COUNT = 9
const INDENT_STEP = 720

// Three-glyph cycle Word's multilevel bullet lists use.
const BULLET_CHARS = ['•', 'o', '▪']

function levelStyle(level) {
    return { paragraph: { indent: { left: INDENT_STEP * (level + 1), hanging: 360 } } }
}

function bulletLevel(level) {
    return {
        level,
        format: LevelFormat.BULLET,
        text: BULLET_CHARS[level % BULLET_CHARS.length],
        alignment: AlignmentType.LEFT,
        style: levelStyle(level),
    }
}

// Every level of the 'decimal' family stays plain decimal ("1.", "2."), regardless of depth --
// deliberately not Word's "List Number" convention of cycling decimal -> lowerLetter ->
// lowerRoman by level. A numbered list nested inside a bulleted item lands at ilvl 1+ of this
// same 'decimal' family to get the correct deeper indent (see convertList in htmlToDocx.js),
// and should still count "1., 2., ..." rather than switch to letters just because of depth.
function decimalLevel(level) {
    return {
        level,
        format: LevelFormat.DECIMAL,
        text: `%${level + 1}.`,
        alignment: AlignmentType.LEFT,
        style: levelStyle(level),
    }
}

// Two static abstract numbering families, defined once -- not one per list encountered.
// Every separate top-level list gets its own `instance` number (see htmlToDocx.js) so
// separate ordered lists don't continue each other's count.
export const numberingConfig = [
    { reference: 'bullet', levels: Array.from({ length: LEVEL_COUNT }, (_, i) => bulletLevel(i)) },
    { reference: 'decimal', levels: Array.from({ length: LEVEL_COUNT }, (_, i) => decimalLevel(i)) },
]

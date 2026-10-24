//
//  markupeditor-app.js
//  
//
//  Created by Steven Harris on 8/5/26.
//

import { MU } from "markupeditor"
import { MarkupEditorDelegate } from "./delegate.js"
import { getMarkdown, exportMarkdown, importMarkdown } from "./markdown.js"
import { makeInsertTableWithHeader } from "./tables.js"
import { getSelectionBlockIndex, selectBlockIndex, blockIndexAtOffset, offsetForBlockIndex } from "./blocks.js"
import { getBlocks } from "./doc-blocks.js"
import { selectText } from "./select-text.js"
import { replaceBlocks } from "./replace-blocks.js"

// Register the delegate so it can be looked up by name when the MarkupEditor instance is created.
MU.registerDelegate(new MarkupEditorDelegate())

MU.getMarkdown = getMarkdown
MU.exportMarkdown = exportMarkdown
MU.importMarkdown = importMarkdown
MU.getSelectionBlockIndex = getSelectionBlockIndex
MU.selectBlockIndex = selectBlockIndex
MU.blockIndexAtOffset = blockIndexAtOffset
MU.offsetForBlockIndex = offsetForBlockIndex
MU.getBlocks = getBlocks
MU.replaceBlocks = replaceBlocks
MU.selectText = selectText
// Override markupeditor-base MU.insertTable to force a header in Markdown
MU.insertTable = makeInsertTableWithHeader(MU.insertTable, () => MU.activeView())


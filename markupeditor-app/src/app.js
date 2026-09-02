//
//  markupeditor-app.js
//  
//
//  Created by Steven Harris on 8/5/26.
//

import { MU } from "markupeditor"
import { MarkupEditorDelegate } from "./delegate.js"
import { getMarkdown, exportMarkdown, importMarkdown } from "./markdown.js"
import { getSelectionBlockIndex, selectBlockIndex, blockIndexAtOffset, offsetForBlockIndex } from "./blocks.js"

// Register the delegate so it can be looked up by name when the MarkupEditor instance is created.
MU.registerDelegate(new MarkupEditorDelegate())

MU.getMarkdown = getMarkdown
MU.exportMarkdown = exportMarkdown
MU.importMarkdown = importMarkdown
MU.getSelectionBlockIndex = getSelectionBlockIndex
MU.selectBlockIndex = selectBlockIndex
MU.blockIndexAtOffset = blockIndexAtOffset
MU.offsetForBlockIndex = offsetForBlockIndex


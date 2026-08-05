//
//  markupeditor-app.js
//  
//
//  Created by Steven Harris on 8/5/26.
//

import { MU } from "markupeditor"
import { MarkupEditorDelegate } from "./delegate.js"
import { getMarkdown, exportMarkdown, importMarkdown } from "./markdown.js"

// Register the delegate so it can be looked up by name when the MarkupEditor instance is created.
MU.registerDelegate(new MarkupEditorDelegate())

MU.getMarkdown = getMarkdown
MU.exportMarkdown = exportMarkdown
MU.importMarkdown = importMarkdown


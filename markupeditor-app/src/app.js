//
//  markupeditor-app.js
//  
//
//  Created by Steven Harris on 8/5/26.
//

import { MU } from "markupeditor"
import { MarkupEditorDelegate } from "./delegate.js"
import { getMarkdown, exportMarkdown, importMarkdown } from "./markdown.js"
import { tightenHtml } from "./tight-lists.js"
import { ensureInstalled as ensureTaskLists, setTaskListsEnabled } from "./task-list.js"
import { rebaseSource } from "./source-map.js"
import { makeInsertTableWithHeader } from "./tables.js"
import { getSelectionBlockIndex, selectBlockIndex, blockIndexAtOffset, offsetForBlockIndex } from "./blocks.js"
import { getBlocks } from "./doc-blocks.js"
import { selectText } from "./select-text.js"
import { replaceBlocks } from "./replace-blocks.js"
import {
  proposeEdits, listSuggestions, nextSuggestion, previousSuggestion, acceptAllSuggestions, rejectAllSuggestions,
  acceptAndNextSuggestion, rejectAndNextSuggestion, acceptAndPreviousSuggestion, rejectAndPreviousSuggestion, suggestionStatus,
} from "./suggestions.js"

// Register the delegate so it can be looked up by name when the MarkupEditor instance is created.
MU.registerDelegate(new MarkupEditorDelegate())

MU.getMarkdown = getMarkdown
MU.exportMarkdown = exportMarkdown
// Only a Markdown document is imported this way, so task lists are shown for Markdown and nothing else.
MU.importMarkdown = (content) => {
  const view = MU.activeView()
  if (view) ensureTaskLists(view)
  return importMarkdown(content)
}
// An editor that loads a Markdown document without importing it, such as the one that comes back from the
// source view, is asked to show task lists directly. The editor is reused across documents, so loading an HTML
// document turns them off.
MU.enableTaskLists = (enabled = true) => {
  const view = MU.activeView()
  if (view) setTaskListsEnabled(view, enabled)
}
MU.tightenHtml = tightenHtml
MU.rebaseSource = rebaseSource
MU.getSelectionBlockIndex = getSelectionBlockIndex
MU.selectBlockIndex = selectBlockIndex
MU.blockIndexAtOffset = blockIndexAtOffset
MU.offsetForBlockIndex = offsetForBlockIndex
MU.getBlocks = getBlocks
MU.replaceBlocks = replaceBlocks
MU.selectText = selectText
MU.proposeEdits = proposeEdits
MU.listSuggestions = listSuggestions
MU.nextSuggestion = nextSuggestion
MU.previousSuggestion = previousSuggestion
MU.acceptAllSuggestions = acceptAllSuggestions
MU.rejectAllSuggestions = rejectAllSuggestions
MU.acceptAndNextSuggestion = acceptAndNextSuggestion
MU.rejectAndNextSuggestion = rejectAndNextSuggestion
MU.acceptAndPreviousSuggestion = acceptAndPreviousSuggestion
MU.rejectAndPreviousSuggestion = rejectAndPreviousSuggestion
MU.suggestionStatus = suggestionStatus
// Override markupeditor-base MU.insertTable to force a header in Markdown
MU.insertTable = makeInsertTableWithHeader(MU.insertTable, () => MU.activeView())


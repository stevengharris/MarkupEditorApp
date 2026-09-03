//
//  markupeditor-delegate.js
//  MarkupEditorApp
//
//  Created by Steven Harris on 8/5/26.
//

import { MU } from 'markupeditor';

/**
 * A MarkupDelegate that receives callbacks that trigger native MacOS dialogs for insert operations.
 */
export class MarkupEditorDelegate {
    
    // Return true (a handled ProseMirror Command), not just fire the callback --
    // these are bound directly as keymap commands (see keymap.js), where a falsy
    // return tells ProseMirror the key went unhandled, letting it fall through to
    // the OS and beep on an otherwise-unbound Cmd combo.
    markupInsertLink(state, dispatch, view) {
        MU.callbackInsertLink()
        return true
    }

    markupInsertImage(state, dispatch, view) {
        MU.callbackInsertImage()
        return true
    }

    markupInsertTable(state, dispatch, view) {
        MU.callbackInsertTable()
        return true
    }

    // GFM table cells have no block-content syntax -- a heading or list in a
    // cell can only be represented via a lossy, warned approximation in the
    // serializer. Vetoing them here means a user never reaches that.
    canStyle(inTable) {
        return !inTable
    }

    canList(inTable) {
        return !inTable
    }

    // A horizontal rule inside a table cell has no Markdown equivalent either --
    // same reasoning as canStyle/canList above.
    canInsertHRule(inTable) {
        return !inTable
    }

}

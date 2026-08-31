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

}

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
    markupInsertLink(state, dispatch, view) {
        console.log("*** markupInsertLink")
    }

}

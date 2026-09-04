import { PluginKey } from 'markupeditor'

// Separate module so both metadataview.js (reads/dispatches collapse state)
// and metadataplugin.js (owns the Plugin whose state this keys into) can
// import it without a circular dependency between the two.
export const metadataPluginKey = new PluginKey('metadata')

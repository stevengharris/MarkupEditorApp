import { MU } from "markupeditor"
import mermaid from "mermaid"

mermaid.initialize()

const view = MU.activeView()
console.log('markupeditor-mermaid: MU.activeView() ->', view)

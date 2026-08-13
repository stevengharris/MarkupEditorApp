# Ghost Plugins Page Render Script

`plugin-grid.js` fetches `plugins.json` and renders it as a grouped card grid. It is not served from this repo — it is pasted into Ghost's Code Injection (Post footer) for the Plugins Page as a `<script type="module">` block, alongside an HTML card containing `<div id="plugin-grid"></div>`. On page load it finds that div, fetches `PLUGINS_JSON_URL`, and renders into it.

## Local verification

`local-preview.html` drives `plugin-grid.js` locally without touching the real Ghost page. It uses a separate container id (`preview-target`) so the script's own auto-run (which looks for `#plugin-grid`) never fires — each button calls `fetchAndRender` directly against a different source: the real committed `plugins.json`, a deliberately malformed fixture (`fixtures/malformed-entry.json`), and a URL that 404s.

Serve the repo root over HTTP first (local-preview.html fetches `../plugins/plugins.json`, a sibling of `website/`) — opening `local-preview.html` directly via `file://` will not work, since `type="module"` imports and `fetch()` both require a real origin:

```bash
python3 -m http.server 8934
```

Then open `http://localhost:8934/website/local-preview.html`.

## Updating the pasted copy

The pasted Ghost script must match `plugin-grid.js` on `main` exactly (minus this repo's own comment about being pasted elsewhere). If `plugin-grid.js` changes, re-paste it into Ghost's Code Injection box by hand — there is no automated sync.

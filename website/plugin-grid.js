// Renders plugins/plugins.json as a grouped card grid on the Ghost Plugins
// Page. Pasted verbatim into Ghost's post-footer Code Injection box (see
// website/README.md) -- not served from this repo.

// TEMPORARY host: MarkupEditorApp is currently a private repo. Must revert to
// MarkupEditorApp once that repo is public -- mirrors the same constant in
// plugins/generate-plugins-json.mjs.
export const PLUGINS_JSON_URL =
  'https://raw.githubusercontent.com/stevengharris/markupeditor-desktop/main/plugins/plugins.json';

const REQUIRED_ENTRY_FIELDS = ['name', 'description', 'author', 'version', 'repo'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True if data is a non-null, non-array object -- a usable plugins.json top level. */
export function isPluginsJson(data) {
  return isPlainObject(data);
}

/** True if entry has all fields a browse card needs, each a non-empty string, and repo is an https:// URL. */
export function validateEntry(entry) {
  if (!isPlainObject(entry)) return false;
  if (!REQUIRED_ENTRY_FIELDS.every((field) => typeof entry[field] === 'string' && entry[field] !== '')) {
    return false;
  }
  return entry.repo.startsWith('https://');
}

/**
 * One section per type key present in data, in Object.entries() order --
 * never dot notation, since the set of type keys is not a fixed list. A
 * type-level value that isn't itself a plain object (e.g. null from a bad
 * hand-edit) yields an empty section rather than throwing. Entries failing
 * validateEntry are dropped from their section; the section itself still
 * appears, even if left with none. Both kinds of drop are logged so a
 * catalog that has silently drifted leaves a trace.
 */
export function groupedSections(data) {
  return Object.entries(data).map(([type, entriesByName]) => {
    if (!isPlainObject(entriesByName)) {
      console.warn(`plugin-grid: type "${type}" has a malformed value, skipping its entries`, entriesByName);
      return { type, entries: [] };
    }
    const entries = Object.values(entriesByName).filter((entry) => {
      const valid = validateEntry(entry);
      if (!valid) {
        console.warn(`plugin-grid: skipping malformed entry under type "${type}"`, entry);
      }
      return valid;
    });
    return { type, entries };
  });
}

/** True if at least one section has at least one valid entry. */
export function hasAnyEntries(sections) {
  return sections.some((section) => section.entries.length > 0);
}

/** "codeview" -> "Codeviews", "widget-type" -> "Widget Types". Generic, no per-type lookup table -- section headings read as a category of plugins, so the last word is pluralized (naive: append "s" unless it already ends in one). */
function humanizeType(type) {
  const words = type
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1));
  const last = words.length - 1;
  if (last >= 0 && !words[last].toLowerCase().endsWith('s')) {
    words[last] += 's';
  }
  return words.join(' ');
}

const STYLE_ELEMENT_ID = 'me-plugin-grid-style';

// Values below assume the site's 62.5%-root convention (1rem == 10px), matching
// the markupeditor theme's own screen.css -- NOT a bare 16px-root assumption.
// Colors/spacing reference the theme's CSS custom properties (--color-border,
// --color-secondary-text, --grid-gap, --container-gap) so cards stay in sync
// with the site's palette and dark/light mode without duplicating values here.
const STYLE_RULES = `
.me-plugin-grid-section { margin: 0 0 3.2rem 0; }
.me-plugin-grid-section h2 { font-size: calc(1.6em * var(--factor, 1)); letter-spacing: -0.02em; margin: 0 0 1.6rem 0; }
.me-plugin-grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 2rem; }
.me-plugin-grid-card { border: 1px solid var(--color-border, #ddd); border-radius: 12px; padding: 2rem; }
.me-plugin-grid-card h3 { margin: 0 0 0.8rem 0; font-size: 1.6rem; }
.me-plugin-grid-card p { margin: 0 0 1rem 0; font-size: 1.4rem; line-height: 1.5; color: var(--color-secondary-text, #444); }
.me-plugin-grid-card .me-plugin-grid-meta { font-size: 1.2rem; color: var(--color-secondary-text, #777); }
.me-plugin-grid-card a { font-weight: 600; }
.me-plugin-grid-unable { color: var(--color-secondary-text, #777); font-style: italic; }
`;

function ensureStylesInjected(doc) {
  if (doc.getElementById(STYLE_ELEMENT_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = STYLE_RULES;
  doc.head.appendChild(style);
}

function buildCard(doc, entry) {
  const card = doc.createElement('div');
  card.className = 'me-plugin-grid-card';

  const heading = doc.createElement('h3');
  heading.textContent = entry.name;
  card.appendChild(heading);

  const description = doc.createElement('p');
  description.textContent = entry.description;
  card.appendChild(description);

  const meta = doc.createElement('p');
  meta.className = 'me-plugin-grid-meta';
  meta.textContent = `${entry.author} · v${entry.version}`;
  card.appendChild(meta);

  const link = doc.createElement('a');
  link.href = entry.repo;
  link.textContent = 'View source';
  card.appendChild(link);

  return card;
}

function buildSection(doc, section) {
  const el = doc.createElement('section');
  el.className = 'me-plugin-grid-section';

  const heading = doc.createElement('h2');
  heading.textContent = humanizeType(section.type);
  el.appendChild(heading);

  const cards = doc.createElement('div');
  cards.className = 'me-plugin-grid-cards';
  for (const entry of section.entries) {
    cards.appendChild(buildCard(doc, entry));
  }
  el.appendChild(cards);

  return el;
}

function renderSections(container, sections) {
  const doc = container.ownerDocument;
  ensureStylesInjected(doc);

  container.innerHTML = '';
  for (const section of sections) {
    container.appendChild(buildSection(doc, section));
  }
}

/** Renders a validated plugins.json object into container. Assumes isPluginsJson(data) already checked. */
export function renderGrid(container, data) {
  renderSections(container, groupedSections(data));
}

/** Replaces container's content with a simple, non-blank "unable to load" state. */
export function showUnableToLoad(container) {
  const doc = container.ownerDocument;
  ensureStylesInjected(doc);

  container.innerHTML = '';
  const message = doc.createElement('p');
  message.className = 'me-plugin-grid-unable';
  message.textContent = 'Plugins are temporarily unavailable. Please check back later.';
  container.appendChild(message);
}

/**
 * Fetches url and renders into container. Any failure -- network error, non-OK
 * response, invalid JSON, or a malformed top-level shape -- renders the
 * "unable to load" state instead of throwing or leaving container blank.
 */
export async function fetchAndRender(url, container) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`plugin-grid: fetch failed with status ${response.status}`);
    }
    const data = await response.json();
    if (!isPluginsJson(data)) {
      throw new Error('plugin-grid: plugins.json top level is not a usable object');
    }
    const sections = groupedSections(data);
    if (!hasAnyEntries(sections)) {
      throw new Error('plugin-grid: no valid entries found in any section');
    }
    renderSections(container, sections);
  } catch (err) {
    console.error('plugin-grid: unable to load plugin catalog', err);
    showUnableToLoad(container);
  }
}

// Auto-run only in a real browser (Ghost Code Injection), never on import --
// this is what lets plugin-grid.test.js import the pure functions above
// under Node without a document existing.
if (typeof document !== 'undefined') {
  const container = document.getElementById('plugin-grid');
  if (container) {
    fetchAndRender(PLUGINS_JSON_URL, container);
  }
}

import { searchBooks, ApiError } from './api';
import { addBook, removeBook, getLibrary, subscribe, type BookEntry } from './library';

const CSS = `
#widget-toggle {
  position: fixed;
  top: 24px;
  right: 24px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.18);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  z-index: 100;
  padding: 0;
  line-height: 1;
}
#widget-toggle:hover { background: rgba(0,0,0,0.78); }

#widget-panel {
  position: fixed;
  top: 80px;
  right: 24px;
  width: 320px;
  max-height: calc(100vh - 120px);
  background: rgba(10,10,14,0.90);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,0.11);
  border-radius: 8px;
  color: #fff;
  font-family: Georgia, serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 99;
}

#widget-search {
  margin: 14px 14px 10px;
  padding: 9px 12px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.13);
  border-radius: 4px;
  color: #fff;
  font-family: Georgia, serif;
  font-size: 14px;
  outline: none;
  flex-shrink: 0;
}
#widget-search::placeholder { color: rgba(255,255,255,0.32); }
#widget-search:focus { border-color: rgba(255,255,255,0.30); }

#widget-results {
  overflow-y: auto;
  flex: 1;
  padding: 0 6px;
}
#widget-results::-webkit-scrollbar { width: 4px; }
#widget-results::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

.widget-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 6px;
  border-radius: 5px;
  transition: background 0.1s;
}
.widget-result:hover { background: rgba(255,255,255,0.05); }

.widget-thumb {
  width: 34px;
  height: 50px;
  object-fit: cover;
  border-radius: 2px;
  flex-shrink: 0;
}
.widget-thumb-ph {
  width: 34px;
  height: 50px;
  flex-shrink: 0;
  background: rgba(255,255,255,0.07);
  border-radius: 2px;
}

.widget-info {
  flex: 1;
  min-width: 0;
}
.widget-title {
  font-size: 13px;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 3px;
}
.widget-sub {
  font-size: 11px;
  opacity: 0.50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.widget-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255,255,255,0.09);
  border: 1px solid rgba(255,255,255,0.17);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  padding: 0;
  line-height: 1;
}
.widget-btn:hover { background: rgba(255,255,255,0.20); }
.widget-btn.in-lib {
  background: rgba(80,200,80,0.14);
  border-color: rgba(80,200,80,0.36);
  color: #7ef07e;
}
.widget-btn.in-lib:hover {
  background: rgba(200,60,60,0.16);
  border-color: rgba(200,60,60,0.36);
  color: #f07e7e;
}

#widget-status {
  padding: 10px 16px 14px;
  font-size: 12px;
  opacity: 0.40;
  text-align: center;
  flex-shrink: 0;
}
`;

let panelOpen = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentResults: BookEntry[] = [];
let inLibrary: Set<string> = new Set();

function injectStyles(): void {
  if (document.getElementById('widget-styles')) return;
  const s = document.createElement('style');
  s.id = 'widget-styles';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function setStatus(msg: string): void {
  const el = document.getElementById('widget-status');
  if (!el) return;
  el.textContent = msg;
  (el as HTMLElement).style.display = msg ? '' : 'none';
}

function buildBtn(entry: BookEntry): HTMLButtonElement {
  const btn = document.createElement('button');
  const added = inLibrary.has(entry.id);
  btn.className = 'widget-btn' + (added ? ' in-lib' : '');
  btn.textContent = added ? '✓' : '+';

  btn.addEventListener('mouseenter', () => {
    if (btn.classList.contains('in-lib')) btn.textContent = '−';
  });
  btn.addEventListener('mouseleave', () => {
    if (btn.classList.contains('in-lib')) btn.textContent = '✓';
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (inLibrary.has(entry.id)) {
      removeBook(entry.id);
    } else {
      addBook(entry);
    }
  });
  return btn;
}

function buildRow(entry: BookEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'widget-result';
  row.dataset.id = entry.id;

  if (entry.coverUrl) {
    const img = document.createElement('img');
    img.className = 'widget-thumb';
    img.src = entry.coverUrl;
    img.alt = '';
    row.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'widget-thumb-ph';
    row.appendChild(ph);
  }

  const info = document.createElement('div');
  info.className = 'widget-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'widget-title';
  titleEl.textContent = entry.title;

  const subEl = document.createElement('div');
  subEl.className = 'widget-sub';
  const parts = [...entry.authors.slice(0, 1), entry.year ? String(entry.year) : ''].filter(Boolean);
  subEl.textContent = parts.join(' · ');

  info.appendChild(titleEl);
  info.appendChild(subEl);

  row.appendChild(info);
  row.appendChild(buildBtn(entry));
  return row;
}

function renderResults(): void {
  const container = document.getElementById('widget-results');
  if (!container) return;
  container.innerHTML = '';
  for (const entry of currentResults) {
    container.appendChild(buildRow(entry));
  }
}

async function runSearch(query: string): Promise<void> {
  try {
    currentResults = await searchBooks(query);
    renderResults();
    setStatus(currentResults.length === 0 ? 'No results' : '');
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      setStatus('Rate limited — wait a moment');
    } else {
      setStatus('Search failed');
    }
  }
}

function buildUI(): void {
  const toggle = document.createElement('button');
  toggle.id = 'widget-toggle';
  toggle.textContent = '+';
  toggle.title = 'Add books to library';
  document.body.appendChild(toggle);

  const panel = document.createElement('div');
  panel.id = 'widget-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <input id="widget-search" type="search" placeholder="Search books…" autocomplete="off" spellcheck="false" />
    <div id="widget-results"></div>
    <div id="widget-status">Type to search</div>
  `;
  document.body.appendChild(panel);

  toggle.addEventListener('click', () => {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? 'flex' : 'none';
    toggle.textContent = panelOpen ? '×' : '+';
    if (panelOpen) {
      (document.getElementById('widget-search') as HTMLInputElement).focus();
    }
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && panelOpen) {
      panelOpen = false;
      panel.style.display = 'none';
      toggle.textContent = '+';
    }
  });

  const searchEl = panel.querySelector('#widget-search') as HTMLInputElement;
  searchEl.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const q = searchEl.value.trim();
    if (q.length < 3) {
      currentResults = [];
      renderResults();
      setStatus(q.length === 0 ? 'Type to search' : 'Keep typing…');
      return;
    }
    setStatus('Searching…');
    debounceTimer = setTimeout(() => runSearch(q), 600);
  });
}

export function initWidget(): void {
  injectStyles();
  buildUI();
  inLibrary = new Set(getLibrary().books.map(b => b.id));
  subscribe(lib => {
    inLibrary = new Set(lib.books.map(b => b.id));
    if (panelOpen) renderResults();
  });
}

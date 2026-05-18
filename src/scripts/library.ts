export type BookEntry = {
  id: string;       // ISBN-13 (primary key); falls back to Google Books volume ID when no ISBN
  title: string;
  authors: string[];
  coverUrl: string; // Empty string means no cover available
  year?: number;
  addedAt: number;  // Unix ms timestamp
};

export type Library = {
  books: BookEntry[];
  version: number;
};

const LIBRARY_KEY = 'alexandria_library';
const CURRENT_VERSION = 1;

type Listener = (library: Library) => void;
const listeners = new Set<Listener>();

function defaultLibrary(): Library {
  return { books: [], version: CURRENT_VERSION };
}

export function getLibrary(): Library {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return defaultLibrary();
    const parsed = JSON.parse(raw) as Library;
    if (parsed.version !== CURRENT_VERSION) return defaultLibrary();
    return parsed;
  } catch {
    return defaultLibrary();
  }
}

function saveLibrary(lib: Library): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
}

function notify(lib: Library): void {
  listeners.forEach(l => l(lib));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Returns true if added, false if already in library
export function addBook(entry: BookEntry): boolean {
  const lib = getLibrary();
  if (lib.books.some(b => b.id === entry.id)) return false;
  const updated: Library = { ...lib, books: [...lib.books, entry] };
  saveLibrary(updated);
  notify(updated);
  return true;
}

export function removeBook(id: string): void {
  const lib = getLibrary();
  const updated: Library = { ...lib, books: lib.books.filter(b => b.id !== id) };
  saveLibrary(updated);
  notify(updated);
}

export function toUrlParam(lib: Library): string {
  return lib.books.map(b => b.id).join(',');
}

export function parseUrlParam(param: string): string[] {
  return param.split(',').map(s => s.trim()).filter(Boolean);
}

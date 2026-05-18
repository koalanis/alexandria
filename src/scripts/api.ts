import type { BookEntry } from './library';

// --- Google Books (search) ---

const GB_BASE = 'https://www.googleapis.com/books/v1';

type GBVolume = {
  id: string;
  volumeInfo: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
  };
};

type GBSearchResponse = { totalItems: number; items?: GBVolume[] };

function gbToBookEntry(vol: GBVolume): BookEntry {
  const info = vol.volumeInfo;
  const isbn =
    info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier ??
    info.industryIdentifiers?.find(i => i.type === 'ISBN_10')?.identifier;
  const rawCover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? '';
  const parsedYear = parseInt(info.publishedDate?.slice(0, 4) ?? '', 10);
  return {
    id: isbn ?? vol.id,
    title: info.title ?? 'Unknown Title',
    authors: info.authors ?? [],
    coverUrl: rawCover.replace(/^http:\/\//, 'https://'),
    year: isNaN(parsedYear) ? undefined : parsedYear,
    addedAt: Date.now(),
  };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function searchBooks(query: string): Promise<BookEntry[]> {
  const url = `${GB_BASE}/volumes?q=${encodeURIComponent(query)}&maxResults=10`;
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(res.status, `Google Books search failed: ${res.status}`);
  const data: GBSearchResponse = await res.json();
  return (data.items ?? []).map(gbToBookEntry);
}

// --- Open Library (ISBN hydration) ---

const OL_BASE = 'https://openlibrary.org';

type OLBookData = {
  title?: string;
  authors?: Array<{ name: string }>;
  publish_date?: string;
  cover?: { medium?: string; large?: string; small?: string };
};

function olToBookEntry(isbn: string, data: OLBookData): BookEntry {
  const coverUrl =
    data.cover?.medium ??
    data.cover?.large ??
    `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  const parsedYear = parseInt(data.publish_date?.slice(-4) ?? '', 10);
  return {
    id: isbn,
    title: data.title ?? 'Unknown Title',
    authors: (data.authors ?? []).map(a => a.name),
    coverUrl,
    year: isNaN(parsedYear) ? undefined : parsedYear,
    addedAt: Date.now(),
  };
}

export async function getBookByIsbn(isbn: string): Promise<BookEntry | null> {
  const key = `ISBN:${isbn}`;
  const url = `${OL_BASE}/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json() as Record<string, OLBookData>;
  const entry = data[key];
  if (!entry) return null;
  return olToBookEntry(isbn, entry);
}

export async function getBooksByIsbns(isbns: string[]): Promise<BookEntry[]> {
  const results = await Promise.allSettled(isbns.map(getBookByIsbn));
  return results
    .filter((r): r is PromiseFulfilledResult<BookEntry> =>
      r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

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
  cover?: { small?: string; medium?: string; large?: string };
  number_of_pages?: number;
  works?: Array<{ key: string }>;
  excerpts?: Array<{ text: string }>;
  notes?: string | { value: string };
};

type OLWork = {
  description?: string | { value: string };
};

async function fetchWorksDescription(key: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${OL_BASE}${key}.json`);
    if (!res.ok) return undefined;
    const work: OLWork = await res.json();
    const d = work.description;
    if (!d) return undefined;
    return typeof d === 'string' ? d : d.value;
  } catch {
    return undefined;
  }
}

function olToBookEntry(isbn: string, data: OLBookData, description?: string): BookEntry {
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
    pages: data.number_of_pages,
    description,
    addedAt: Date.now(),
  };
}

export async function getBookByIsbn(isbn: string): Promise<BookEntry | null> {
  const bibkey = `ISBN:${isbn}`;
  const url = `${OL_BASE}/api/books?bibkeys=${encodeURIComponent(bibkey)}&format=json&jscmd=data`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json() as Record<string, OLBookData>;
  const entry = data[bibkey];
  if (!entry) return null;

  const worksKey = entry.works?.[0]?.key;
  const description = worksKey ? await fetchWorksDescription(worksKey) : undefined;

  return olToBookEntry(isbn, entry, description);
}

// Fetches pages + description for a batch of ISBNs without overwriting existing entries.
// Returns a map of isbn → partial patch (only fields that came back non-empty).
export async function enrichBooks(isbns: string[]): Promise<Map<string, Partial<BookEntry>>> {
  const bibkeys = isbns.map(i => `ISBN:${i}`).join(',');
  const url = `${OL_BASE}/api/books?bibkeys=${encodeURIComponent(bibkeys)}&format=json&jscmd=data`;
  const results = new Map<string, Partial<BookEntry>>();

  try {
    const res = await fetch(url);
    if (!res.ok) return results;
    const data = await res.json() as Record<string, OLBookData>;

    await Promise.all(Object.entries(data).map(async ([key, bookData]) => {
      const isbn = key.replace('ISBN:', '');
      const patch: Partial<BookEntry> = {};

      if (bookData.number_of_pages) patch.pages = bookData.number_of_pages;

      const worksKey = bookData.works?.[0]?.key;
      if (worksKey) {
        const description = await fetchWorksDescription(worksKey);
        if (description) patch.description = description;
      }

      if (Object.keys(patch).length > 0) results.set(isbn, patch);
    }));
  } catch { /* network failure — return what we have */ }

  return results;
}

export async function getBooksByIsbns(isbns: string[]): Promise<BookEntry[]> {
  const results = await Promise.allSettled(isbns.map(getBookByIsbn));
  return results
    .filter((r): r is PromiseFulfilledResult<BookEntry> =>
      r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

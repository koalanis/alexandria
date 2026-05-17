import type { BookEntry } from './library';

const BASE = 'https://www.googleapis.com/books/v1';

type GBVolume = {
  id: string;
  volumeInfo: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
  };
};

type GBSearchResponse = {
  totalItems: number;
  items?: GBVolume[];
};

function toBookEntry(vol: GBVolume): BookEntry {
  const info = vol.volumeInfo;

  const isbn =
    info.industryIdentifiers?.find(i => i.type === 'ISBN_13')?.identifier ??
    info.industryIdentifiers?.find(i => i.type === 'ISBN_10')?.identifier;

  // Google Books sometimes returns HTTP — upgrade to HTTPS
  const rawCover =
    info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? '';
  const coverUrl = rawCover.replace(/^http:\/\//, 'https://');

  const parsedYear = parseInt(info.publishedDate?.slice(0, 4) ?? '', 10);
  const year = isNaN(parsedYear) ? undefined : parsedYear;

  return {
    id: vol.id,
    isbn,
    title: info.title ?? 'Unknown Title',
    authors: info.authors ?? [],
    coverUrl,
    year,
    addedAt: Date.now(),
  };
}

export async function searchBooks(query: string): Promise<BookEntry[]> {
  const url = `${BASE}/volumes?q=${encodeURIComponent(query)}&maxResults=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Books search failed: ${res.status}`);
  const data: GBSearchResponse = await res.json();
  return (data.items ?? []).map(toBookEntry);
}

export async function getBookById(volumeId: string): Promise<BookEntry | null> {
  const url = `${BASE}/volumes/${encodeURIComponent(volumeId)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Google Books fetch failed: ${res.status}`);
  const vol: GBVolume = await res.json();
  return toBookEntry(vol);
}

export async function getBooksByIds(volumeIds: string[]): Promise<BookEntry[]> {
  const results = await Promise.allSettled(volumeIds.map(getBookById));
  return results
    .filter(
      (r): r is PromiseFulfilledResult<BookEntry> =>
        r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value);
}

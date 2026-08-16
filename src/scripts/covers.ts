import type { BookEntry } from './library';
import { coverConfig } from './config';

export async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('timeout')), 6000);
    const done = (fn: () => void) => { clearTimeout(timer); fn(); };
    img.onload = () => done(() => {
      // Treat tiny images as "no cover" (e.g. OpenLibrary placeholder stub).
      if (img.naturalWidth < 50 || img.naturalHeight < 50) reject(new Error('placeholder'));
      else resolve(img);
    });
    img.onerror = (e) => done(() => reject(e));
    img.src = url;
  });
}

export interface BookCoverProvider {
  fetchCover(entry: BookEntry): Promise<HTMLImageElement | null>;
}

// Fetches the image at entry.coverUrl. The URL is set by whichever API populated the entry.
class UrlCoverProvider implements BookCoverProvider {
  async fetchCover(entry: BookEntry): Promise<HTMLImageElement | null> {
    if (!entry.coverUrl) return null;
    try { return await loadImage(entry.coverUrl); } catch { return null; }
  }
}

// Skips cover images entirely — useful for offline/testing scenarios.
class DisabledCoverProvider implements BookCoverProvider {
  async fetchCover(_entry: BookEntry): Promise<HTMLImageElement | null> { return null; }
}

export const coverProviders = {
  url:      new UrlCoverProvider(),
  disabled: new DisabledCoverProvider(),
} satisfies Record<string, BookCoverProvider>;

export async function fetchBookCover(entry: BookEntry): Promise<HTMLImageElement | null> {
  return coverProviders[coverConfig.provider].fetchCover(entry);
}

import type { BookEntry } from './library';

export type CarouselCallbacks = {
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
};

const CSS = `
#carousel-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font-family: Georgia, serif;
  color: #fff;
  user-select: none;
  z-index: 10;
}
#carousel-overlay button {
  pointer-events: all;
  cursor: pointer;
  background: rgba(0,0,0,0.45);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.18);
  font-family: Georgia, serif;
  transition: background 0.15s;
  border-radius: 4px;
}
#carousel-overlay button:hover {
  background: rgba(0,0,0,0.68);
}
#carousel-back {
  position: absolute;
  top: 24px;
  left: 24px;
  padding: 8px 18px;
  font-size: 14px;
  letter-spacing: 0.03em;
}
#carousel-prev, #carousel-next {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 52px;
  height: 72px;
  font-size: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, opacity 0.2s;
}
#carousel-prev { left: 24px; }
#carousel-next { right: 24px; }
#carousel-meta {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 56px 40px 32px;
  background: linear-gradient(transparent, rgba(0,0,0,0.75));
  text-shadow: 0 1px 4px rgba(0,0,0,0.9);
}
#carousel-title {
  font-size: 26px;
  font-weight: bold;
  margin-bottom: 8px;
  line-height: 1.25;
}
#carousel-author {
  font-size: 15px;
  opacity: 0.82;
  margin-bottom: 4px;
}
#carousel-year {
  font-size: 13px;
  opacity: 0.52;
}
#carousel-counter {
  position: absolute;
  bottom: 32px;
  right: 40px;
  font-size: 13px;
  opacity: 0.48;
  letter-spacing: 0.06em;
}
`;

let callbacksBound = false;

function injectStyles(): void {
  if (document.getElementById('carousel-styles')) return;
  const s = document.createElement('style');
  s.id = 'carousel-styles';
  s.textContent = CSS;
  document.head.appendChild(s);
}

function q(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export function showCarousel(
  entry: BookEntry,
  index: number,
  total: number,
  callbacks: CarouselCallbacks
): void {
  injectStyles();

  let overlay = document.getElementById('carousel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'carousel-overlay';
    overlay.innerHTML = `
      <button id="carousel-back">← Shelf</button>
      <button id="carousel-prev">‹</button>
      <button id="carousel-next">›</button>
      <div id="carousel-meta">
        <div id="carousel-title"></div>
        <div id="carousel-author"></div>
        <div id="carousel-year"></div>
        <div id="carousel-counter"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  if (!callbacksBound) {
    q('carousel-back').addEventListener('click', callbacks.onBack);
    q('carousel-prev').addEventListener('click', callbacks.onPrev);
    q('carousel-next').addEventListener('click', callbacks.onNext);
    callbacksBound = true;
  }

  overlay.style.display = '';
  updateCarousel(entry, index, total);
}

export function updateCarousel(
  entry: BookEntry,
  index: number,
  total: number
): void {
  q('carousel-title').textContent = entry.title;
  q('carousel-author').textContent = entry.authors.join(', ');
  q('carousel-year').textContent = entry.year ? String(entry.year) : '';
  q('carousel-counter').textContent = `${index + 1} / ${total}`;
  (q('carousel-prev') as HTMLButtonElement).style.opacity = index === 0 ? '0.25' : '1';
  (q('carousel-next') as HTMLButtonElement).style.opacity =
    index === total - 1 ? '0.25' : '1';
}

export function hideCarousel(): void {
  const overlay = document.getElementById('carousel-overlay');
  if (overlay) overlay.style.display = 'none';
}

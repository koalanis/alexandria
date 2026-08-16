import * as THREE from 'three';
import type { BookEntry } from './library';
import { textureConfig, FAKE_DESCRIPTION } from './config';
import { loadImage, fetchBookCover } from './covers';

const TEX = 512;

// UV regions in 512×512 texture space.
// Derived from book.obj UV coords with Three.js flipY=true applied:
//   pixel_y = (1 - uv_v) * TEX
// Front cover: U 0.551–0.942, V 0.400–0.983
// Spine:       U 0.403–0.551, V 0.400–0.983
// Back cover:  U 0.012–0.403, V 0.400–0.983
const FRONT = { x: 282, y:  9, w: 200, h: 298 } as const;
const SPINE  = { x: 206, y:  9, w:  76, h: 298 } as const;
const BACK   = { x:   6, y:  9, w: 200, h: 298 } as const;

const PALETTE = [
  '#8B1A1A', // deep crimson
  '#1B3A6B', // navy
  '#2C5F2E', // forest green
  '#7A3B1E', // terracotta
  '#4A3728', // espresso
  '#1A4A4A', // dark teal
  '#5B2333', // burgundy
  '#2E3D5C', // slate blue
  '#4A5A2E', // olive
  '#6B2D2D', // brick red
  '#2B4A3F', // deep sage
  '#3D2B5C', // aubergine
  '#5C3A1A', // amber brown
  '#1E3A5F', // cobalt
  '#4E2020', // oxblood
  '#1A3D2B', // hunter green
  '#5C4A1A', // dark gold
  '#2A1F3D', // midnight
  '#6B3D1A', // rust
  '#1F3B4A', // steel blue
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickColor(id: string): string {
  return PALETTE[hash(id) % PALETTE.length];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return (
    '#' +
    [r + amt, g + amt, b + amt]
      .map(v => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0'))
      .join('')
  );
}

function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines = 4
): void {
  const words = text.split(' ');
  let line = '';
  const lines: string[] = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    ctx.fillText(lines[i], x, y + i * lineH, maxW);
  }
}

function paintBack(ctx: CanvasRenderingContext2D, entry: BookEntry): void {
  const text = entry.description ?? (textureConfig.fakeDescriptions ? FAKE_DESCRIPTION : null);
  if (!text) return;

  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  ctx.fillRect(BACK.x, BACK.y, BACK.w, BACK.h);

  const maxChars = 420;
  const clipped = text.length > maxChars ? text.slice(0, maxChars).trimEnd() + '…' : text;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.80)';
  ctx.font = '8px Georgia, serif';
  drawWrapped(ctx, clipped, BACK.x + 10, BACK.y + 16, BACK.w - 20, 12, 18);
}

function paintSpine(ctx: CanvasRenderingContext2D): void {
  // Dark scrim only — text is rendered as a separate billboard child mesh.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(SPINE.x, SPINE.y, SPINE.w, SPINE.h);
}

function paintFallbackFront(
  ctx: CanvasRenderingContext2D,
  entry: BookEntry,
  baseColor: string
): void {
  ctx.fillStyle = shade(baseColor, 15);
  ctx.fillRect(FRONT.x, FRONT.y, FRONT.w, FRONT.h);

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(FRONT.x + 7, FRONT.y + 7, FRONT.w - 14, FRONT.h - 14);

  const cx   = FRONT.x + FRONT.w / 2;
  const maxW = FRONT.w - 28;

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = 'rgba(255,255,255,0.95)';
  ctx.font         = 'bold 28px Georgia, serif';
  drawWrapped(ctx, entry.title, cx, FRONT.y + 50, maxW, 34, 3);

  if (entry.authors.length > 0) {
    ctx.textBaseline = 'bottom';
    ctx.fillStyle    = 'rgba(255,255,255,0.65)';
    ctx.font         = 'italic 18px Georgia, serif';
    ctx.fillText(entry.authors[0], cx, FRONT.y + FRONT.h - 20, maxW);
  }
}

function paintCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement
): void {
  // object-fit: cover — scale to fill the front face, crop overflow
  const scale = Math.max(FRONT.w / img.width, FRONT.h / img.height);
  const sw = img.width * scale;
  const sh = img.height * scale;
  const dx = FRONT.x + (FRONT.w - sw) / 2;
  const dy = FRONT.y + (FRONT.h - sh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(FRONT.x, FRONT.y, FRONT.w, FRONT.h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, sw, sh);
  ctx.restore();
}

function sampleAverageColor(img: HTMLImageElement): [number, number, number] | null {
  try {
    const size = 16;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const cx = c.getContext('2d')!;
    cx.drawImage(img, 0, 0, size, size);
    const { data } = cx.getImageData(0, 0, size, size);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 128) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    }
    return n > 0 ? [r / n, g / n, b / n] : null;
  } catch {
    return null;
  }
}

// --- Base texture (page edges / mesh detail from the original OBJ texture) ---

let baseImg: HTMLImageElement | null = null;

async function getBaseImg(): Promise<HTMLImageElement> {
  if (baseImg) return baseImg;
  baseImg = await loadImage('/texture_0.png');
  return baseImg;
}

// --- Cache & public API ---

const cache = new Map<string, THREE.Texture>();

export async function getBookTexture(entry: BookEntry): Promise<THREE.Texture> {
  const key = entry.id;
  if (cache.has(key)) return cache.get(key)!;

  const baseColor = textureConfig.colorize ? pickColor(entry.id) : textureConfig.defaultColor;

  const coverImg = await fetchBookCover(entry);

  const canvas = document.createElement('canvas');
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext('2d')!;

  try {
    ctx.drawImage(await getBaseImg(), 0, 0, TEX, TEX);
  } catch {
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(0, 0, TEX, TEX);
  }

  // Tint page edges with the cover's average color.
  if (coverImg) {
    const color = sampleAverageColor(coverImg);
    if (color) {
      const [r, g, b] = color;
      ctx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},0.82)`;
      ctx.fillRect(0, 0, TEX, TEX);
    }
  }

  paintBack(ctx, entry);
  paintSpine(ctx);

  if (coverImg) {
    paintCoverImage(ctx, coverImg);
  } else {
    paintFallbackFront(ctx, entry, baseColor);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

export function makeBookMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: texture });
}

export function disposeTextures(): void {
  cache.forEach(t => t.dispose());
  cache.clear();
}

// Evict specific books so their textures are regenerated on next render.
// Use when a book's description changes (back-cover text updates).
export function invalidateBookTextures(ids: Iterable<string>): void {
  for (const id of ids) {
    const t = cache.get(id);
    if (t) { t.dispose(); cache.delete(id); }
  }
}

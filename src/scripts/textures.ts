import * as THREE from 'three';
import type { BookEntry } from './library';
import { textureConfig } from './config';

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
  '#5C3D2E', '#2E4057', '#048A81', '#8B4513',
  '#6B4226', '#1B4332', '#3D2B1F', '#2C3E50',
  '#7B3F00', '#1A3A4A',
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
  if (!entry.description) return;

  ctx.fillStyle = 'rgba(0,0,0,0.40)';
  ctx.fillRect(BACK.x, BACK.y, BACK.w, BACK.h);

  const maxChars = 420;
  const text = entry.description.length > maxChars
    ? entry.description.slice(0, maxChars).trimEnd() + '…'
    : entry.description;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.80)';
  ctx.font = '8px Georgia, serif';
  drawWrapped(ctx, text, BACK.x + 10, BACK.y + 16, BACK.w - 20, 12, 18);
}

function paintSpine(
  ctx: CanvasRenderingContext2D,
  entry: BookEntry,
  _baseColor: string
): void {
  // Semi-transparent scrim so white title text is legible over the original texture.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(SPINE.x, SPINE.y, SPINE.w, SPINE.h);

  ctx.save();
  ctx.translate(SPINE.x + SPINE.w / 2, SPINE.y + SPINE.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.90)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px Georgia, serif';
  const label =
    entry.title.length > 30 ? entry.title.slice(0, 30) + '…' : entry.title;
  ctx.fillText(label, 0, 0, SPINE.h - 12);
  ctx.restore();
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

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = 'bold 18px Georgia, serif';
  drawWrapped(
    ctx,
    entry.title,
    FRONT.x + FRONT.w / 2,
    FRONT.y + Math.round(FRONT.h * 0.28),
    FRONT.w - 16,
    22
  );

  if (entry.authors.length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '13px Georgia, serif';
    ctx.fillText(
      entry.authors[0],
      FRONT.x + FRONT.w / 2,
      FRONT.y + Math.round(FRONT.h * 0.72),
      FRONT.w - 16
    );
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

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// --- Config ---

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
  const key = entry.coverUrl || entry.id;
  if (cache.has(key)) return cache.get(key)!;

  const baseColor = textureConfig.colorize ? pickColor(entry.id) : textureConfig.defaultColor;
  const canvas = document.createElement('canvas');
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext('2d')!;

  // Draw original mesh texture first — preserves hand-painted page edges.
  // Cover regions (FRONT/SPINE/BACK) are painted on top of this base.
  try {
    ctx.drawImage(await getBaseImg(), 0, 0, TEX, TEX);
  } catch {
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(0, 0, TEX, TEX);
  }

  paintBack(ctx, entry);
  paintSpine(ctx, entry, baseColor);

  if (entry.coverUrl) {
    try {
      const img = await loadImage(entry.coverUrl);
      paintCoverImage(ctx, img);
    } catch {
      paintFallbackFront(ctx, entry, baseColor);
    }
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

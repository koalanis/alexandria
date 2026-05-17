# Alexandria — Design Document

> A shareable personal library rendered in WebGL. Show the world what's on your shelf.

---

## Vision

Alexandria lets you build and share a 3D bookshelf that represents your real personal library. You add books by searching an API (Google Books, Open Library), and they appear on your shelf as textured 3D objects — each cover pulled from the book's metadata. Anyone with your link can visit your shelf and browse it.

The 3D rendering is the product. It is not decorative chrome on top of a list — the shelf *is* the interface.

---

## Current State

| Layer | What exists |
|---|---|
| Framework | Astro 4 (static, client-side only) |
| 3D | Three.js 0.169 — instanced shelf of 100 procedurally colored books |
| Interaction | Raycaster hover rotates the hovered book |
| Data | None — all books are fake, random brown tones |
| Persistence | None |
| Routing | Single page (`/`) |

The foundation is solid: InstancedMesh renders 100 books efficiently, there is a working raycaster, and the scene structure (camera, lights, controls) is already in place.

---

## MVP Scope

The MVP proves the core loop: **add a real book → see it on your shelf with its cover → share the shelf**.

### MVP Feature Set

1. **Book search widget** — search by title/author/ISBN against the Google Books API, pick a result, add it to your library.
2. **Persistent library** — books saved to `localStorage` for now (no auth required for MVP).
3. **Cover textures** — each book on the shelf is textured with its cover image from the API, mapped to the OBJ's UV coordinates.
4. **Shelf view** — the existing pseudo-shelf layout, now showing real books in their correct cover-textured form instead of procedural colors.
5. **Carousel view** — a second render state: a close-up of a single book centered on screen, with left/right navigation (keyboard arrows or on-screen buttons) to move through the library one book at a time.
6. **Shareable URL** — the library state is serializable to a URL param (or short hash) so you can share `alexandria.app/shelf?b=ISBN1,ISBN2,...`.

### Out of Scope for MVP

- Auth / user accounts
- Backend / database
- Reading status (read, want-to-read, currently reading)
- Book ratings or reviews
- Social features (following, activity feed)
- Mobile / touch controls
- Custom shelf themes
- Multiple shelves per user

---

## Render States

The app has two distinct 3D modes. State lives in a top-level `viewState` variable and transitions are animated.

### State 1 — Shelf View (default)

The camera is pulled back, showing the full shelf grid. This is the "overview" — you see your whole collection at once.

- Books are arranged in rows, InstancedMesh for performance
- Each instance uses a `CanvasTexture` or loaded image texture for the cover
- Hovering a book tilts it toward the viewer (existing behavior, keep it)
- Clicking a book transitions to Carousel View, centering on that book
- A floating "Add Book" button opens the search widget overlay

### State 2 — Carousel View

The camera animates to a close-up of a single book, centered and facing the viewer. The full cover is readable.

- Book title, author, and year rendered in DOM overlay (HTML over the canvas, not in-scene)
- Left / Right arrow keys (and on-screen chevrons) animate to adjacent books in the collection
- The active book slowly rotates on its Y axis to show the spine and back cover
- Pressing Escape or a back button animates the camera back to Shelf View
- The carousel order matches shelf order (left-to-right, top-to-bottom)

### Transition Animation

Both transitions use a `TWEEN`-style lerp on the camera position and target:
- Shelf → Carousel: camera flies forward toward the clicked book over ~600ms
- Carousel → Shelf: camera pulls back over ~600ms

---

## Book Data Model

```typescript
type BookEntry = {
  id: string;          // Google Books volume ID (stable, unique)
  isbn?: string;       // ISBN-13 preferred, ISBN-10 fallback
  title: string;
  authors: string[];
  coverUrl: string;    // Thumbnail URL from Google Books API
  year?: number;
  addedAt: number;     // Unix timestamp
};

type Library = {
  books: BookEntry[];
  version: number;     // Schema version for future migrations
};
```

---

## Texture System

Each book instance needs a cover texture. The pipeline:

1. When a book is added, `coverUrl` is fetched from Google Books API (`volumeInfo.imageLinks.thumbnail`).
2. A `TextureLoader` loads the image at render time. For CORS, use the Google Books thumbnail URL directly (they serve with permissive headers).
3. The texture is assigned to the corresponding InstancedMesh instance via a per-instance material.

**Challenge:** `InstancedMesh` shares one material across all instances. Three.js does not natively support per-instance textures in InstancedMesh.

**Solution options (pick one for MVP):**

| Option | Tradeoff |
|---|---|
| **A — TextureAtlas** | Pack all cover images into one atlas texture, use per-instance UV offsets via `InstancedBufferAttribute`. Best performance, harder to implement. |
| **B — Individual Meshes** | Drop InstancedMesh, use individual `Mesh` objects with their own `MeshStandardMaterial`. Simpler code, fine up to ~200 books. |
| **C — MeshBatchedMesh** (Three r168+) | New Three.js API, supports per-item geometry and material. Worth evaluating. |

**MVP recommendation: Option B.** The library size is human-scale (tens to low hundreds of books). Individual meshes with individual materials are trivial to implement and maintain. InstancedMesh optimization can be added later if profiling shows it's needed.

---

## Book Search Widget

A modal overlay, triggered by "Add Book" button. Not rendered in WebGL — plain HTML/CSS.

**Flow:**
1. User types a title, author, or ISBN into a search input.
2. Debounced `fetch` hits Google Books API: `https://www.googleapis.com/books/v1/volumes?q={query}&maxResults=10`.
3. Results rendered as a scrollable list: cover thumbnail + title + author + year.
4. Clicking a result calls `addBook(entry: BookEntry)`, which appends to `localStorage` and updates the 3D scene.
5. Modal closes.

**Edge cases:**
- No cover image → use a procedurally generated colored cover (title initials, random shelf color)
- Duplicate ISBN → show "Already on your shelf" instead of adding again
- Network error → show inline error, allow retry

---

## Shareable URL

Library state is serialized as a comma-separated list of Google Books volume IDs in the URL:

```
/shelf?b=zyTCAlFPjgYC,NggnmAEACAAJ,dVkHAAAAIAAJ
```

On page load, if `?b=` is present, the shelf is populated from the API by fetching each volume ID. The visitor sees a read-only shelf (no Add Book button).

For MVP, the user copies their share URL manually. A "Copy Link" button encodes `window.location.origin + /shelf?b=` + joined IDs.

---

## Architecture

```
src/
├── pages/
│   └── index.astro          # Entry, mounts scene and widget
├── scripts/
│   ├── alexandria.ts        # Scene root, view state machine
│   ├── shelf.ts             # Shelf view: layout, mesh management
│   ├── carousel.ts          # Carousel view: camera, nav, overlay
│   ├── textures.ts          # Cover texture loading, fallback generation
│   ├── library.ts           # Library state, localStorage persistence
│   ├── api.ts               # Google Books API client
│   └── utils.ts             # Existing utilities (keep)
└── components/
    ├── AddBookWidget.astro  # Search modal (HTML overlay)
    └── CarouselOverlay.astro # Title/author DOM overlay for carousel
```

---

## API Integration

**Primary:** Google Books API
- No API key required for read-only volume lookups (rate limited but sufficient for MVP)
- Endpoints used:
  - Search: `GET /books/v1/volumes?q={query}&maxResults=10`
  - Lookup by ID: `GET /books/v1/volumes/{volumeId}`

**Fallback:** Open Library
- Used if Google Books has no cover image
- Cover API: `https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg`

---

## Tech Stack Decisions

| Decision | Choice | Reason |
|---|---|---|
| 3D engine | Three.js (keep) | Already integrated, sufficient for this use case |
| Framework | Astro (keep) | Minimal overhead, good for mostly-client-side 3D apps |
| State management | Vanilla TS module | No framework needed; library state is a simple array |
| Persistence (MVP) | localStorage | No backend needed for MVP; trivial to migrate |
| Per-book textures | Individual Mesh objects | Simplest correct solution for human-scale collections |
| UI overlay | HTML/CSS over canvas | 3D text is fragile; DOM is better for readable metadata |
| API | Google Books | No key required, covers most Western library catalogs |

---

## Non-Goals (permanent)

- This is not a book discovery or recommendation app.
- This is not a social network. Sharing is read-only.
- This will not sync reading progress (that's Goodreads).
- The 3D shelf is not an afterthought — it is the product. Do not degrade it to a fallback for a list view.

---

## Open Questions

- **Shelf layout:** Fixed grid of N×M, or dynamic rows that grow as books are added?
- **Cover aspect ratio:** Book covers are portrait; the current OBJ model may need UV remapping to display them without distortion.
- **URL sharing vs. account:** If a user clears localStorage, their shelf is gone. Is a lightweight backend (Cloudflare KV, Supabase) worth adding before launch?
- **Book limit:** Is there a practical upper bound for the MVP? (Suggest: 200 books before perf is revisited.)

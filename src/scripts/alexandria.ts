import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';
import { loadObj } from './utils';
import { getLibrary, addBook, clearLibrary, patchBooks, subscribe, parseUrlParam, type BookEntry } from './library';
import { getBooksByIsbns, enrichBooks } from './api';
import { seedIfEmpty, seedConfig } from './seed';
import { getBookTexture, makeBookMaterial, disposeTextures, invalidateBookTextures } from './textures';
import { sceneConfig, spineScale } from './config';
import { showCarousel, updateCarousel, hideCarousel } from './carousel';

// --- Constants ---

const BOOKS_PER_ROW  = 20;
const SPACING_Y      = 5.88;
const SPINE_HALF     = 0.741;  // half of OBJ Y range (1.481 total) at scale=1
const SHELF_GAP      = 0.05;   // world-unit gap between adjacent books
const CAROUSEL_CAM_Z = 18;  // camera Z in carousel (shelf is at Z=0)
const BOOK_POP_Z     = 3;   // how far the active book steps forward
const T_ENTER        = 0.6; // transition duration seconds (enter/exit)
const T_NAV          = 0.3; // transition duration seconds (prev/next)

// Approximate world-space dimensions of the book mesh at qInitial.
// Tweak if shelf boards / back panel look misaligned.
const BOOK_HEIGHT = 5.5;   // world Y, bottom to top of a standing book
const BOOK_DEPTH  = 3.2;   // world Z, spine face to back cover

const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9, metalness: 0.0 });

// --- Quaternions ---

// qInitial: book standing upright, spine facing viewer (+Z)
const qInitial = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2)
);
// qHovered: tilted 45° to hint at cover (existing hover effect)
const qHovered = qInitial
  .clone()
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4));
// qFacing: book upright with cover facing viewer.
// At qInitial the cover already faces +Z but the book is in landscape (height along -X).
// rotY(-π/2) in local space brings height (OBJ+Z) to world +Y so the book stands portrait.
const qFacing = qInitial
  .clone()
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
// Camera identity: looking straight down -Z (no rotation needed in carousel)
const qCameraForward = new THREE.Quaternion();

// --- Types ---

type CameraAnim = {
  fromCamPos:  THREE.Vector3;
  toCamPos:    THREE.Vector3;
  fromCamQuat: THREE.Quaternion;
  toCamQuat:   THREE.Quaternion;
  // optional book mesh to animate alongside camera
  mesh?:         THREE.Mesh;
  fromMeshPos?:  THREE.Vector3;
  toMeshPos?:    THREE.Vector3;
  fromMeshQuat?: THREE.Quaternion;
  toMeshQuat?:   THREE.Quaternion;
  // sub-windows [start, end] within 0..1 for pos and quat independently
  meshPosWindow?:  [number, number];
  meshQuatWindow?: [number, number];
  t:        number;
  duration: number;
  onDone:   (() => void) | null;
};

type RenderContext = {
  renderer: THREE.WebGLRenderer;
  camera:   THREE.PerspectiveCamera;
  clock:    THREE.Clock;
  scene:    THREE.Scene;
  controls: THREE.Controls<any>;
  raycaster: THREE.Raycaster;
  pointer:  THREE.Vector2;
};

type SceneState = {
  bookGeometry:    THREE.BufferGeometry;
  shelfGroup:      THREE.Group;
  bookcaseGroup:   THREE.Group | null;
  shelfPositions:  THREE.Vector3[];
  hoveredMesh:     THREE.Mesh | null;
  viewState:       'shelf' | 'carousel';
  carouselIndex:   number;
  savedCameraPos:  THREE.Vector3;
  savedCameraQuat: THREE.Quaternion;
  cameraAnim:      CameraAnim | null;
};

// --- Position helpers ---

function computeShelfPositions(entries: BookEntry[]): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  let x = 0, col = 0, row = 0;
  for (const entry of entries) {
    if (col >= BOOKS_PER_ROW) { col = 0; row++; x = 0; }
    const halfW = SPINE_HALF * spineScale(entry.pages);
    positions.push(new THREE.Vector3(x + halfW, -row * SPACING_Y, 0));
    x += halfW * 2 + SHELF_GAP;
    col++;
  }
  return positions;
}

function carouselCamPos(pos: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(pos.x, pos.y, CAROUSEL_CAM_Z);
}

function bookPoppedPos(pos: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(pos.x, pos.y, BOOK_POP_Z);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Map raw t into a sub-window [start, end], returning 0..1
function windowed(t: number, start: number, end: number): number {
  if (t <= start) return 0;
  if (t >= end)   return 1;
  return (t - start) / (end - start);
}

// --- Shelf building ---

// Billboard spine label — separate canvas plane child to avoid lossy texture scaling.
// rotation.y = -π/2 orients the plane normal toward world +Z (viewer).
// scale.y = 1/parentScale cancels the parent's Y stretch so text size is constant.
function makeSpineLabel(entry: BookEntry, parentScale: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width  = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = 'rgba(255,255,255,0.90)';
  ctx.font         = 'bold 22px Georgia, serif';
  ctx.fillText(entry.title, 256, 32, 492);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const geo = new THREE.PlaneGeometry(5.842, 1.481);
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const label = new THREE.Mesh(geo, mat);
  label.rotation.y = -Math.PI / 2;
  label.rotation.z = Math.PI;
  label.position.x = -1.975;
  label.scale.set(1, 1 / parentScale, 1);
  return label;
}

function buildBookcase(
  entries: BookEntry[],
  positions: THREE.Vector3[],
): THREE.Group {
  const group   = new THREE.Group();
  const SHELF_T = 0.22;   // horizontal board thickness
  const SIDE_T  = 0.28;   // vertical side panel thickness
  const BACK_T  = 0.12;   // back panel thickness
  const LIP     = 0.15;   // how much shelf protrudes in front of spine face
  const DROP    = 0.30;   // gap between estimated book bottom and shelf top surface

  const numRows = Math.ceil(entries.length / BOOKS_PER_ROW);

  // Widest row drives the overall case width.
  let maxRowWidth = 0;
  for (let r = 0; r < numRows; r++) {
    const lastIdx = Math.min((r + 1) * BOOKS_PER_ROW, entries.length) - 1;
    if (positions[lastIdx]) {
      const hw = SPINE_HALF * spineScale(entries[lastIdx].pages);
      maxRowWidth = Math.max(maxRowWidth, positions[lastIdx].x + hw);
    }
  }

  const caseW    = maxRowWidth + SIDE_T * 2;
  const shelfD   = BOOK_DEPTH + LIP;                   // depth of boards
  const centerX  = maxRowWidth / 2;                    // center of books in X
  const centerZ  = (LIP - BOOK_DEPTH) / 2;            // boards centered between spine face and back

  // Vertical extents for the whole case
  const topY    =  BOOK_HEIGHT / 2 + DROP + SHELF_T;
  const bottomY = -(numRows - 1) * SPACING_Y - BOOK_HEIGHT / 2 - DROP - SHELF_T;
  const caseH   = topY - bottomY;
  const midY    = (topY + bottomY) / 2;

  // Horizontal shelf boards (one above each row + one below last row)
  const boardGeo = new THREE.BoxGeometry(caseW, SHELF_T, shelfD);
  for (let r = 0; r <= numRows; r++) {
    const board = new THREE.Mesh(boardGeo, woodMat);
    const by = r === 0
      ? BOOK_HEIGHT / 2 + DROP + SHELF_T / 2                              // top board
      : -(r - 1) * SPACING_Y - BOOK_HEIGHT / 2 - DROP - SHELF_T / 2;    // bottom of row r-1
    board.position.set(centerX, by, centerZ);
    group.add(board);
  }

  // Side panels
  const sideGeo = new THREE.BoxGeometry(SIDE_T, caseH, shelfD);
  const leftPanel  = new THREE.Mesh(sideGeo, woodMat);
  const rightPanel = new THREE.Mesh(sideGeo, woodMat);
  leftPanel.position.set(-SIDE_T / 2, midY, centerZ);
  rightPanel.position.set(maxRowWidth + SIDE_T / 2, midY, centerZ);
  group.add(leftPanel, rightPanel);

  // Back panel
  const backGeo   = new THREE.BoxGeometry(caseW, caseH, BACK_T);
  const backPanel = new THREE.Mesh(backGeo, woodMat);
  backPanel.position.set(centerX, midY, -BOOK_DEPTH - BACK_T / 2);
  group.add(backPanel);

  return group;
}

async function buildBookMesh(
  entry: BookEntry,
  position: THREE.Vector3,
  geometry: THREE.BufferGeometry
): Promise<THREE.Mesh> {
  const texture = await getBookTexture(entry);
  const mesh = new THREE.Mesh(geometry, makeBookMaterial(texture));
  mesh.position.copy(position);
  mesh.quaternion.copy(qInitial);
  const scale = spineScale(entry.pages);
  mesh.scale.set(1, scale, 1);
  mesh.userData.bookId   = entry.id;
  mesh.userData.shelfPos = position.clone();
  mesh.add(makeSpineLabel(entry, scale));
  return mesh;
}

async function syncShelf(entries: BookEntry[], state: SceneState): Promise<void> {
  if (state.viewState === 'carousel') exitCarousel(state);
  for (const bookMesh of state.shelfGroup.children) {
    for (const child of bookMesh.children) {
      ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).map?.dispose();
    }
  }
  // Dispose old bookcase geometry before clearing
  if (state.bookcaseGroup) {
    state.bookcaseGroup.traverse(obj => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
    state.bookcaseGroup = null;
  }
  state.shelfGroup.clear();
  state.hoveredMesh = null;
  state.cameraAnim = null;
  state.shelfPositions = computeShelfPositions(entries);
  const meshes = await Promise.all(
    entries.map((entry, i) => buildBookMesh(entry, state.shelfPositions[i], state.bookGeometry))
  );
  meshes.forEach(m => state.shelfGroup.add(m));
  state.bookcaseGroup = buildBookcase(entries, state.shelfPositions);
  state.shelfGroup.add(state.bookcaseGroup);
}

// --- Camera / book animation ---

function startAnim(
  rc: RenderContext,
  state: SceneState,
  toCamPos: THREE.Vector3,
  toCamQuat: THREE.Quaternion,
  duration: number,
  mesh?: THREE.Mesh,
  toMeshPos?: THREE.Vector3,
  toMeshQuat?: THREE.Quaternion,
  meshPosWindow?: [number, number],
  meshQuatWindow?: [number, number],
  onDone?: () => void,
): void {
  state.cameraAnim = {
    fromCamPos:  rc.camera.position.clone(),
    toCamPos:    toCamPos.clone(),
    fromCamQuat: rc.camera.quaternion.clone(),
    toCamQuat:   toCamQuat.clone(),
    mesh,
    fromMeshPos:  mesh?.position.clone(),
    toMeshPos:    toMeshPos?.clone(),
    fromMeshQuat: mesh?.quaternion.clone(),
    toMeshQuat:   toMeshQuat?.clone(),
    meshPosWindow,
    meshQuatWindow,
    t: 0,
    duration,
    onDone: onDone ?? null,
  };
}

function stepAnim(rc: RenderContext, state: SceneState, delta: number): void {
  const a = state.cameraAnim!;
  a.t = Math.min(1, a.t + delta / a.duration);

  rc.camera.position.lerpVectors(a.fromCamPos, a.toCamPos, easeInOut(a.t));
  rc.camera.quaternion.slerpQuaternions(a.fromCamQuat, a.toCamQuat, easeInOut(a.t));

  if (a.mesh && a.fromMeshPos && a.toMeshPos && a.fromMeshQuat && a.toMeshQuat) {
    const [ps, pe] = a.meshPosWindow  ?? [0, 1];
    const [qs, qe] = a.meshQuatWindow ?? [0, 1];
    a.mesh.position.lerpVectors(a.fromMeshPos,  a.toMeshPos,  easeInOut(windowed(a.t, ps, pe)));
    a.mesh.quaternion.slerpQuaternions(a.fromMeshQuat, a.toMeshQuat, easeInOut(windowed(a.t, qs, qe)));
  }

  if (a.t >= 1) {
    const cb = a.onDone;
    state.cameraAnim = null;
    cb?.();
  }
}

// --- View transitions ---

function getBookMesh(state: SceneState, index: number): THREE.Mesh | undefined {
  return state.shelfGroup.children[index] as THREE.Mesh | undefined;
}

function enterCarousel(index: number, rc: RenderContext, state: SceneState): void {
  if (state.cameraAnim) return;
  const books = getLibrary().books;
  if (!books[index]) return;

  state.savedCameraPos  = rc.camera.position.clone();
  state.savedCameraQuat = rc.camera.quaternion.clone();
  state.viewState    = 'carousel';
  state.carouselIndex = index;
  state.hoveredMesh  = null;

  const mesh = getBookMesh(state, index);

  showCarousel(books[index], index, books.length, {
    onBack: () => exitCarousel(state, rc),
    onPrev: () => navigateCarousel(-1, rc, state),
    onNext: () => navigateCarousel(1, rc, state),
  });

  const pos = state.shelfPositions[index];
  startAnim(
    rc, state,
    carouselCamPos(pos), qCameraForward,
    T_ENTER,
    mesh, bookPoppedPos(pos), qFacing,
    [0, 0.5], [0.5, 1],
  );
}

function exitCarousel(state: SceneState, rc?: RenderContext): void {
  hideCarousel();
  state.viewState = 'shelf';

  // Snap active book back to shelf — or animate it if we have rc
  const mesh = getBookMesh(state, state.carouselIndex);

  const homePos = state.shelfPositions[state.carouselIndex];

  if (!rc) {
    if (mesh && homePos) {
      mesh.position.copy(homePos);
      mesh.quaternion.copy(qInitial);
    }
    return;
  }

  startAnim(
    rc, state,
    state.savedCameraPos, state.savedCameraQuat,
    T_ENTER,
    mesh, homePos, qInitial,
    [0.5, 1], [0, 0.5],
  );
}

function navigateCarousel(dir: -1 | 1, rc: RenderContext, state: SceneState): void {
  if (state.cameraAnim) return;
  const books = getLibrary().books;
  const next  = state.carouselIndex + dir;
  if (next < 0 || next >= books.length) return;

  const old         = getBookMesh(state, state.carouselIndex);
  const oldShelfPos = state.shelfPositions[state.carouselIndex];
  const holdCamPos  = rc.camera.position.clone();
  const holdCamQuat = rc.camera.quaternion.clone();

  // Phase 1: old book returns to shelf, camera holds
  startAnim(
    rc, state,
    holdCamPos, holdCamQuat,
    T_NAV,
    old, oldShelfPos, qInitial,
    undefined, undefined,
    () => {
      // Phase 2: new book comes forward, camera pans to it
      state.carouselIndex = next;
      updateCarousel(books[next], next, books.length);
      const mesh = getBookMesh(state, next);
      const pos  = state.shelfPositions[next];
      startAnim(
        rc, state,
        carouselCamPos(pos), qCameraForward,
        T_NAV,
        mesh, bookPoppedPos(pos), qFacing,
      );
    }
  );
}

// --- Scene setup ---

function setupLights(scene: THREE.Scene): void {
  const positions: [number, number, number][] = [
    [4, 10, 0], [-4, 10, 0], [0, 10, 4], [0, 10, -4],
    [4, -10, 0], [-4, -10, 0], [0, -10, 4], [0, -10, -4],
  ];
  for (const [x, y, z] of positions) {
    const light = new THREE.PointLight(0xffffff, 1, 0, 0);
    light.position.set(x, y, z);
    scene.add(light);
  }
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
}

function handleRaycasting(rc: RenderContext, state: SceneState): void {
  rc.raycaster.setFromCamera(rc.pointer, rc.camera);
  const hits = rc.raycaster.intersectObjects(state.shelfGroup.children, false);
  state.hoveredMesh = (hits[0]?.object as THREE.Mesh) ?? null;
}

function handleShelfAnimations(state: SceneState): void {
  const halfH = BOOK_HEIGHT / 2;
  for (const child of state.shelfGroup.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const target = child === state.hoveredMesh ? qHovered : qInitial;
    if (child.quaternion.angleTo(target) > 0.005) {
      child.quaternion.rotateTowards(target, 0.1);
    }
    // Keep the book's bottom fixed: arc the center around the base pivot
    const sp = child.userData.shelfPos as THREE.Vector3 | undefined;
    if (!sp) continue;
    const theta = child.quaternion.angleTo(qInitial);
    child.position.y = sp.y - halfH * (1 - Math.cos(theta));
    child.position.z = sp.z + halfH * Math.sin(theta);
  }
}

function registerEvents(rc: RenderContext, state: SceneState): void {
  window.addEventListener('pointermove', (e: PointerEvent) => {
    rc.pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    rc.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  window.addEventListener('click', () => {
    if (state.viewState !== 'shelf' || state.cameraAnim) return;
    rc.raycaster.setFromCamera(rc.pointer, rc.camera);
    const hits = rc.raycaster.intersectObjects(state.shelfGroup.children, false);
    if (!hits[0]) return;
    const idx = state.shelfGroup.children.indexOf(hits[0].object);
    if (idx >= 0) enterCarousel(idx, rc, state);
  });

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (state.viewState !== 'carousel') return;
    if (e.key === 'ArrowLeft')  navigateCarousel(-1, rc, state);
    if (e.key === 'ArrowRight') navigateCarousel(1,  rc, state);
    if (e.key === 'Escape')     exitCarousel(state, rc);
  });
}

// --- URL hydration ---

async function hydrateFromUrl(): Promise<void> {
  const params = new URLSearchParams(window.location.search);

  if (params.has('seed')) {
    clearLibrary();
    seedConfig.books.forEach(addBook);
    history.replaceState(null, '', window.location.pathname);
    return;
  }

  const param = params.get('books');
  if (!param) return;

  const isbns = parseUrlParam(param);
  clearLibrary();
  const fetched = await getBooksByIsbns(isbns);
  fetched.forEach(addBook);

  history.replaceState(null, '', window.location.pathname);
}

// --- Entry point ---

export async function threeMain(): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(new THREE.Color(sceneConfig.backgroundColor));
  document.body.style.background = sceneConfig.backgroundColor;
  document.body.appendChild(renderer.domElement);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(20, 0, 50);

  const clock    = new THREE.Clock();
  const controls = new FirstPersonControls(camera, renderer.domElement);
  controls.activeLook  = false;
  controls.movementSpeed = 10;

  const rc: RenderContext = {
    renderer, camera, clock, scene, controls,
    raycaster: new THREE.Raycaster(),
    pointer:   new THREE.Vector2(),
  };

  setupLights(scene);

  const obj          = await loadObj(new OBJLoader(), '');
  const bookGeometry = (obj.children[0] as THREE.Mesh).geometry;
  const shelfGroup   = new THREE.Group();
  scene.add(shelfGroup);

  const state: SceneState = {
    bookGeometry,
    shelfGroup,
    bookcaseGroup:   null,
    shelfPositions:  [],
    hoveredMesh:     null,
    viewState:       'shelf',
    carouselIndex:   0,
    savedCameraPos:  camera.position.clone(),
    savedCameraQuat: camera.quaternion.clone(),
    cameraAnim:      null,
  };

  registerEvents(rc, state);
  await hydrateFromUrl();
  seedIfEmpty();
  await syncShelf(getLibrary().books, state);
  subscribe(library => syncShelf(library.books, state));

  // Enrich books missing pages/description — fires after shelf renders, patches in one update.
  const unenriched = getLibrary().books.filter(
    b => !b.description && /^\d{10,13}$/.test(b.id)
  );
  if (unenriched.length > 0) {
    enrichBooks(unenriched.map(b => b.id)).then(patches => {
      // Invalidate textures only for books that gained a description — their
      // back-cover text needs to be redrawn. Everything else stays cached.
      const toInvalidate = [...patches.entries()]
        .filter(([, p]) => p.description)
        .map(([id]) => id);
      if (toInvalidate.length > 0) invalidateBookTextures(toInvalidate);
      patchBooks(patches);
    });
  }

  renderer.setAnimationLoop(() => {
    const delta = rc.clock.getDelta();

    if (state.cameraAnim) {
      stepAnim(rc, state, delta);
    } else if (state.viewState === 'shelf') {
      rc.controls.update(delta);
      handleRaycasting(rc, state);
      handleShelfAnimations(state);
    }
    // carousel idle — book already faced, nothing to animate per-frame

    renderer.render(scene, rc.camera);
  });
}

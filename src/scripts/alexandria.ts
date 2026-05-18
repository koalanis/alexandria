import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';
import { loadObj } from './utils';
import { getLibrary, subscribe, type BookEntry } from './library';
import { seedIfEmpty } from './seed';
import { getBookTexture, makeBookMaterial } from './textures';
import { showCarousel, updateCarousel, hideCarousel } from './carousel';

// --- Top-level config ---

export const sceneConfig = {
  backgroundColor: '#13151a',
};

// --- Constants ---

const BOOKS_PER_ROW  = 20;
const SPACING_X      = 1.555;
const SPACING_Y      = 5.88;
const CAROUSEL_CAM_Z = 18;  // camera Z in carousel (shelf is at Z=0)
const BOOK_POP_Z     = 3;   // how far the active book steps forward
const T_ENTER        = 0.6; // transition duration seconds (enter/exit)
const T_NAV          = 0.3; // transition duration seconds (prev/next)

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
  hoveredMesh:     THREE.Mesh | null;
  viewState:       'shelf' | 'carousel';
  carouselIndex:   number;
  savedCameraPos:  THREE.Vector3;
  savedCameraQuat: THREE.Quaternion;
  cameraAnim:      CameraAnim | null;
};

// --- Position helpers ---

function shelfPosition(index: number): THREE.Vector3 {
  const col = index % BOOKS_PER_ROW;
  const row = Math.floor(index / BOOKS_PER_ROW);
  return new THREE.Vector3(col * SPACING_X, -row * SPACING_Y, 0);
}

function carouselCamPos(bookIndex: number): THREE.Vector3 {
  const p = shelfPosition(bookIndex);
  return new THREE.Vector3(p.x, p.y, CAROUSEL_CAM_Z);
}

function bookPoppedPos(bookIndex: number): THREE.Vector3 {
  const p = shelfPosition(bookIndex);
  return new THREE.Vector3(p.x, p.y, BOOK_POP_Z);
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

async function buildBookMesh(
  entry: BookEntry,
  index: number,
  geometry: THREE.BufferGeometry
): Promise<THREE.Mesh> {
  const texture = await getBookTexture(entry);
  const mesh = new THREE.Mesh(geometry, makeBookMaterial(texture));
  mesh.position.copy(shelfPosition(index));
  mesh.quaternion.copy(qInitial);
  mesh.userData.bookId = entry.id;
  return mesh;
}

async function syncShelf(entries: BookEntry[], state: SceneState): Promise<void> {
  if (state.viewState === 'carousel') exitCarousel(state);
  state.shelfGroup.clear();
  state.hoveredMesh = null;
  state.cameraAnim = null;
  const meshes = await Promise.all(
    entries.map((entry, i) => buildBookMesh(entry, i, state.bookGeometry))
  );
  meshes.forEach(m => state.shelfGroup.add(m));
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
  onDone?: () => void
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

  // translation first half (book pops out), rotation second half (cover faces viewer)
  startAnim(
    rc, state,
    carouselCamPos(index), qCameraForward,
    T_ENTER,
    mesh, bookPoppedPos(index), qFacing,
    [0, 0.5], [0.5, 1],
  );
}

function exitCarousel(state: SceneState, rc?: RenderContext): void {
  hideCarousel();
  state.viewState = 'shelf';

  // Snap active book back to shelf — or animate it if we have rc
  const mesh = getBookMesh(state, state.carouselIndex);

  if (!rc) {
    if (mesh) {
      mesh.position.copy(shelfPosition(state.carouselIndex));
      mesh.quaternion.copy(qInitial);
    }
    return;
  }

  // rotation first half (cover rotates back), translation second half (slides back into shelf)
  startAnim(
    rc, state,
    state.savedCameraPos, state.savedCameraQuat,
    T_ENTER,
    mesh, shelfPosition(state.carouselIndex), qInitial,
    [0.5, 1], [0, 0.5],
  );
}

function navigateCarousel(dir: -1 | 1, rc: RenderContext, state: SceneState): void {
  if (state.cameraAnim) return;
  const books = getLibrary().books;
  const next  = state.carouselIndex + dir;
  if (next < 0 || next >= books.length) return;

  // Snap old book back to shelf immediately
  const old = getBookMesh(state, state.carouselIndex);
  if (old) {
    old.position.copy(shelfPosition(state.carouselIndex));
    old.quaternion.copy(qInitial);
  }

  state.carouselIndex = next;
  updateCarousel(books[next], next, books.length);

  const mesh = getBookMesh(state, next);
  startAnim(
    rc, state,
    carouselCamPos(next), qCameraForward,
    T_NAV,
    mesh, bookPoppedPos(next), qFacing,
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
  for (const child of state.shelfGroup.children) {
    const mesh  = child as THREE.Mesh;
    const target = mesh === state.hoveredMesh ? qHovered : qInitial;
    if (mesh.quaternion.angleTo(target) > 0.005) {
      mesh.quaternion.rotateTowards(target, 0.1);
    }
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
    hoveredMesh:     null,
    viewState:       'shelf',
    carouselIndex:   0,
    savedCameraPos:  camera.position.clone(),
    savedCameraQuat: camera.quaternion.clone(),
    cameraAnim:      null,
  };

  registerEvents(rc, state);
  seedIfEmpty();
  await syncShelf(getLibrary().books, state);
  subscribe(library => syncShelf(library.books, state));

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

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';
import { loadObj } from './utils';
import { getLibrary, subscribe, type BookEntry } from './library';
import { seedIfEmpty } from './seed';
import { getBookTexture, makeBookMaterial } from './textures';

const qInitial = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2)
);
const qHovered = qInitial
  .clone()
  .multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4)
  );

const BOOKS_PER_ROW = 20;
const SPACING_X = 1.555;
const SPACING_Y = 5.88;

type RenderContext = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  clock: THREE.Clock;
  scene: THREE.Scene;
  controls: THREE.Controls<any>;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
};

type SceneState = {
  bookGeometry: THREE.BufferGeometry;
  shelfGroup: THREE.Group;
  hoveredMesh: THREE.Mesh | null;
};

function shelfPosition(index: number): THREE.Vector3 {
  const col = index % BOOKS_PER_ROW;
  const row = Math.floor(index / BOOKS_PER_ROW);
  return new THREE.Vector3(col * SPACING_X, -row * SPACING_Y, 0);
}

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
  state.shelfGroup.clear();
  state.hoveredMesh = null;
  const meshes = await Promise.all(
    entries.map((entry, i) => buildBookMesh(entry, i, state.bookGeometry))
  );
  meshes.forEach(m => state.shelfGroup.add(m));
}

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
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
}

function handleRaycasting(rc: RenderContext, state: SceneState): void {
  rc.raycaster.setFromCamera(rc.pointer, rc.camera);
  const hits = rc.raycaster.intersectObjects(state.shelfGroup.children, false);
  state.hoveredMesh = (hits[0]?.object as THREE.Mesh) ?? null;
}

function handleAnimations(state: SceneState): void {
  for (const child of state.shelfGroup.children) {
    const mesh = child as THREE.Mesh;
    const target = mesh === state.hoveredMesh ? qHovered : qInitial;
    if (mesh.quaternion.angleTo(target) > 0.005) {
      mesh.quaternion.rotateTowards(target, 0.1);
    }
  }
}

function registerEvents(rc: RenderContext): void {
  window.addEventListener('pointermove', (e: PointerEvent) => {
    rc.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    rc.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
}

export async function threeMain(): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(20, 0, 50);

  const clock = new THREE.Clock();
  const controls = new FirstPersonControls(camera, renderer.domElement);
  controls.activeLook = false;
  controls.movementSpeed = 10;

  const rc: RenderContext = {
    renderer,
    camera,
    clock,
    scene,
    controls,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
  };

  setupLights(scene);
  registerEvents(rc);

  const obj = await loadObj(new OBJLoader(), '');
  const bookGeometry = (obj.children[0] as THREE.Mesh).geometry;

  const shelfGroup = new THREE.Group();
  scene.add(shelfGroup);

  const state: SceneState = {
    bookGeometry,
    shelfGroup,
    hoveredMesh: null,
  };

  seedIfEmpty();
  await syncShelf(getLibrary().books, state);
  subscribe(library => syncShelf(library.books, state));

  renderer.setAnimationLoop(() => {
    rc.controls.update(rc.clock.getDelta());
    handleRaycasting(rc, state);
    handleAnimations(state);
    renderer.render(scene, rc.camera);
  });
}

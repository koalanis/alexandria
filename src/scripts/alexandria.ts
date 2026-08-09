import * as THREE from 'three';

import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';

import { ASSETS, CAMERA, LIGHTING, ROTATION, SHELF } from './config';
import {
  CLOSED_ORIENTATION,
  OPEN_ORIENTATION,
  createBookShelf,
  rotateInstanceToward,
} from './bookshelf';
import { loadObj } from './utils';

type RenderContext = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  clock: THREE.Clock;
  scene: THREE.Scene;
  controls?: THREE.Controls<any>;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
};

type SimulationState = {
  /** Direct handle on the shelf, so the render loop never walks the graph. */
  shelf: THREE.InstancedMesh;
  bookCount: number;
  booksPerRow: number;
  /** Instance ids of the books currently under the pointer. */
  pickedBooks: Set<number>;
};

function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer;
}

function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    CAMERA.near,
    CAMERA.far,
  );
  camera.position.set(CAMERA.position.x, CAMERA.position.y, CAMERA.position.z);
  return camera;
}

function createCameraControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): THREE.Controls<any> {
  const controls = new FirstPersonControls(camera, domElement);
  controls.activeLook = false;
  controls.movementSpeed = CAMERA.movementSpeed;
  return controls;
}

/**
 * Two rings of point lights, one above and one below the shelf, plus a fill
 * ambient. The camera also carries a spot light, so it has to be in the graph.
 */
function addLighting(scene: THREE.Scene, camera: THREE.Camera) {
  const { radius, heights, pointIntensity, ambientIntensity } = LIGHTING;
  const offsets = [
    [0, radius],
    [-radius, 0],
    [radius, 0],
    [0, -radius],
  ];

  for (const height of heights) {
    for (const [x, z] of offsets) {
      const light = new THREE.PointLight(0xffffff, pointIntensity, 0, 0);
      light.position.set(x, height, z);
      scene.add(light);
    }
  }

  scene.add(new THREE.AmbientLight(0xffffff, ambientIntensity));
  camera.add(new THREE.SpotLight(0xffffff, pointIntensity, 0, 0).translateZ(-4));
  scene.add(camera);
}

/** Load the book model and texture, then build the instanced shelf from them. */
async function loadBookShelf(): Promise<THREE.InstancedMesh> {
  const texture = new THREE.TextureLoader().load(ASSETS.bookTexture);
  texture.premultiplyAlpha = true;

  const model = await loadObj(new OBJLoader(), ASSETS.bookModel);
  return createBookShelf(model, texture, SHELF.bookCount, SHELF.booksPerRow);
}

function handleRaycasting(rc: RenderContext, state: SimulationState) {
  rc.raycaster.setFromCamera(rc.pointer, rc.camera);
  const hit = rc.raycaster.intersectObject(state.shelf, false)[0];

  state.pickedBooks.clear();
  if (hit?.instanceId !== undefined) state.pickedBooks.add(hit.instanceId);
}

/**
 * Swing hovered books out of the shelf and ease every other book back into it.
 */
function updateBooks(state: SimulationState) {
  const { shelf, pickedBooks } = state;

  let changed = false;
  for (let i = 0; i < state.bookCount; i++) {
    const moved = pickedBooks.has(i)
      ? rotateInstanceToward(shelf, i, OPEN_ORIENTATION, ROTATION.step)
      : rotateInstanceToward(shelf, i, CLOSED_ORIENTATION, -ROTATION.step);
    changed ||= moved;
  }

  if (changed) shelf.instanceMatrix.needsUpdate = true;
}

function handleRenderLoop(rc: RenderContext, state: SimulationState) {
  rc.controls?.update(rc.clock.getDelta());
  handleRaycasting(rc, state);
  updateBooks(state);
  rc.renderer.render(rc.scene, rc.camera);
}

function registerEventsForRenderContext(rc: RenderContext) {
  // Pointer position in normalized device coordinates (-1 to +1 on both axes).
  window.addEventListener('pointermove', (event: PointerEvent) => {
    rc.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    rc.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  });

  window.addEventListener('resize', () => {
    rc.camera.aspect = window.innerWidth / window.innerHeight;
    rc.camera.updateProjectionMatrix();
    rc.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

export async function threeMain() {
  const renderer = createRenderer();
  document.body.appendChild(renderer.domElement);

  const camera = createCamera();
  const scene = new THREE.Scene();
  addLighting(scene, camera);

  const rc: RenderContext = {
    camera,
    renderer,
    scene,
    clock: new THREE.Clock(),
    controls: createCameraControls(camera, renderer.domElement),
    pointer: new THREE.Vector2(),
    raycaster: new THREE.Raycaster(),
  };

  const shelf = await loadBookShelf();
  scene.add(shelf);

  const state: SimulationState = {
    shelf,
    bookCount: SHELF.bookCount,
    booksPerRow: SHELF.booksPerRow,
    pickedBooks: new Set(),
  };

  registerEventsForRenderContext(rc);
  renderer.setAnimationLoop(() => handleRenderLoop(rc, state));
}

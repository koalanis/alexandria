import * as THREE from 'three';

import { BOOK_COLOR, ROTATION, SHELF } from './config';

/** Orientation of a book sitting flush on the shelf. */
export const CLOSED_ORIENTATION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2),
);

/** Orientation of a book swung out towards the viewer. */
export const OPEN_ORIENTATION = CLOSED_ORIENTATION.clone().multiply(
  new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    ROTATION.openAngle,
  ),
);

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Scratch objects reused by the render loop. Allocating these per instance per
// frame was the single largest source of GC churn in the animation.
const _matrix = new THREE.Matrix4();
const _rotation = new THREE.Matrix4();
const _quaternion = new THREE.Quaternion();

/** Pick a spine colour near the base brown, clamped to a valid 24-bit RGB. */
function randomBookColor(): number {
  const jitter = () => (Math.random() - 0.5) * BOOK_COLOR.jitter;
  const channel = (base: number) =>
    THREE.MathUtils.clamp(Math.round(base + jitter()), 0, 255);

  const [r, g, b] = BOOK_COLOR.base;
  return (channel(r) << 16) | (channel(g) << 8) | channel(b);
}

/**
 * OBJLoader hands back a Group; the book model's geometry lives on the first
 * Mesh inside it.
 */
function findFirstMesh(group: THREE.Object3D): THREE.Mesh {
  let found: THREE.Mesh | undefined;
  group.traverse((child) => {
    if (!found && (child as THREE.Mesh).isMesh) found = child as THREE.Mesh;
  });
  if (!found) throw new Error('Loaded model contains no mesh');
  return found;
}

/**
 * Build a single InstancedMesh holding every book, laid out in rows that wrap
 * at `SHELF.booksPerRow` and stack downwards.
 */
export function createBookShelf(
  model: THREE.Object3D,
  texture: THREE.Texture,
  count: number,
  booksPerRow: number,
): THREE.InstancedMesh {
  const geometry = findFirstMesh(model).geometry;
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const instancedMesh = new THREE.InstancedMesh(geometry, material, count);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / booksPerRow);
    const column = i % booksPerRow;

    dummy.position.set(
      column * SHELF.bookSpacingX,
      -row * SHELF.rowSpacingY,
      0,
    );
    dummy.rotation.setFromQuaternion(CLOSED_ORIENTATION);
    dummy.updateMatrix();

    instancedMesh.setMatrixAt(i, dummy.matrix);
    instancedMesh.setColorAt(i, color.setHex(randomBookColor()));
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

  return instancedMesh;
}

/**
 * Step one book a single frame towards `target`, rotating about its local Y
 * axis. Returns true if the matrix actually changed, so callers can flag
 * `instanceMatrix.needsUpdate` at most once per frame.
 */
export function rotateInstanceToward(
  mesh: THREE.InstancedMesh,
  instanceId: number,
  target: THREE.Quaternion,
  step: number,
): boolean {
  mesh.getMatrixAt(instanceId, _matrix);
  _quaternion.setFromRotationMatrix(_matrix);

  // q and -q describe the same orientation, so the angle between two
  // orientations is 2 * acos(|dot|). Using the raw dot product instead reads a
  // settled book as a half-turn away from where it already is, which leaves it
  // spinning forever.
  const dot = THREE.MathUtils.clamp(Math.abs(_quaternion.dot(target)), 0, 1);
  if (2 * Math.acos(dot) <= Math.abs(step)) return false;

  _rotation.makeRotationAxis(Y_AXIS, step);
  _matrix.multiply(_rotation);
  mesh.setMatrixAt(instanceId, _matrix);
  return true;
}

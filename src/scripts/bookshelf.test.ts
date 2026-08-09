import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  CLOSED_ORIENTATION,
  OPEN_ORIENTATION,
  createBookShelf,
  rotateInstanceToward,
} from './bookshelf';
import { ROTATION, SHELF } from './config';

/** Stand-in for the Group that OBJLoader hands back for book.obj. */
function bookModel(): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  return group;
}

function makeShelf(
  count: number = SHELF.bookCount,
  perRow: number = SHELF.booksPerRow,
) {
  return createBookShelf(bookModel(), new THREE.Texture(), count, perRow);
}

const _matrix = new THREE.Matrix4();
const _quaternion = new THREE.Quaternion();

function positionOf(shelf: THREE.InstancedMesh, i: number): THREE.Vector3 {
  shelf.getMatrixAt(i, _matrix);
  return new THREE.Vector3().setFromMatrixPosition(_matrix);
}

/** The true angle between an instance's orientation and `target`, in radians. */
function angleTo(
  shelf: THREE.InstancedMesh,
  i: number,
  target: THREE.Quaternion,
): number {
  shelf.getMatrixAt(i, _matrix);
  _quaternion.setFromRotationMatrix(_matrix);
  return 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(_quaternion.dot(target)), 0, 1));
}

describe('createBookShelf', () => {
  it('finds the geometry on a nested mesh rather than assuming children[0]', () => {
    const nested = new THREE.Group();
    const inner = new THREE.Group();
    inner.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    nested.add(inner);

    expect(() =>
      createBookShelf(nested, new THREE.Texture(), 4, 2),
    ).not.toThrow();
  });

  it('throws a clear error when the model has no mesh', () => {
    expect(() =>
      createBookShelf(new THREE.Group(), new THREE.Texture(), 4, 2),
    ).toThrow(/no mesh/i);
  });

  it('lays the first row out left to right', () => {
    const shelf = makeShelf();

    expect(positionOf(shelf, 0).x).toBeCloseTo(0);
    expect(positionOf(shelf, 1).x).toBeCloseTo(SHELF.bookSpacingX);
    expect(positionOf(shelf, 19).x).toBeCloseTo(19 * SHELF.bookSpacingX);
    expect(positionOf(shelf, 19).y).toBeCloseTo(0);
  });

  it('wraps to a new row every booksPerRow books', () => {
    const shelf = makeShelf();

    const first = positionOf(shelf, SHELF.booksPerRow);
    expect(first.x).toBeCloseTo(0);
    expect(first.y).toBeCloseTo(-SHELF.rowSpacingY);

    const last = positionOf(shelf, 99);
    expect(last.x).toBeCloseTo(19 * SHELF.bookSpacingX);
    expect(last.y).toBeCloseTo(-4 * SHELF.rowSpacingY);
  });

  it('honours a booksPerRow that does not divide the count evenly', () => {
    const shelf = makeShelf(7, 3);

    expect(positionOf(shelf, 2).y).toBeCloseTo(0);
    expect(positionOf(shelf, 3).y).toBeCloseTo(-SHELF.rowSpacingY);
    expect(positionOf(shelf, 6).y).toBeCloseTo(-2 * SHELF.rowSpacingY);
    expect(positionOf(shelf, 6).x).toBeCloseTo(0);
  });

  it('gives every book a valid, jittered spine colour', () => {
    const shelf = makeShelf();
    expect(shelf.instanceColor).toBeTruthy();

    const color = new THREE.Color();
    const seen = new Set<number>();
    for (let i = 0; i < SHELF.bookCount; i++) {
      shelf.getColorAt(i, color);
      for (const channel of [color.r, color.g, color.b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
      seen.add(color.getHex());
    }

    expect(seen.size).toBeGreaterThan(10);
  });

  it('starts every book closed', () => {
    const shelf = makeShelf();
    for (const i of [0, 1, 42, 99]) {
      expect(angleTo(shelf, i, CLOSED_ORIENTATION)).toBeCloseTo(0);
    }
  });
});

describe('rotateInstanceToward', () => {
  /** Step a book until it settles, returning the frame count. */
  function settle(
    shelf: THREE.InstancedMesh,
    i: number,
    target: THREE.Quaternion,
    step: number,
    limit = 500,
  ): number {
    let frames = 0;
    while (rotateInstanceToward(shelf, i, target, step) && frames < limit) frames++;
    return frames;
  }

  it('swings a hovered book open in about one swing-angle worth of steps', () => {
    const shelf = makeShelf();
    const frames = settle(shelf, 0, OPEN_ORIENTATION, ROTATION.step);

    const expected = ROTATION.openAngle / ROTATION.step;
    expect(frames).toBeLessThan(expected * 2);
    expect(angleTo(shelf, 0, OPEN_ORIENTATION)).toBeLessThanOrEqual(ROTATION.step);
  });

  it('eases a released book back closed', () => {
    const shelf = makeShelf();
    settle(shelf, 0, OPEN_ORIENTATION, ROTATION.step);

    const frames = settle(shelf, 0, CLOSED_ORIENTATION, -ROTATION.step);
    expect(frames).toBeLessThan((ROTATION.openAngle / ROTATION.step) * 2);
    expect(angleTo(shelf, 0, CLOSED_ORIENTATION)).toBeLessThanOrEqual(ROTATION.step);
  });

  it('reports no movement once a book has settled', () => {
    const shelf = makeShelf();
    settle(shelf, 0, OPEN_ORIENTATION, ROTATION.step);

    expect(rotateInstanceToward(shelf, 0, OPEN_ORIENTATION, ROTATION.step)).toBe(false);
  });

  // Regression: q and -q are the same orientation, but Quaternion
  // .setFromRotationMatrix returns either. Comparing a raw dot product against
  // the target reads an at-rest book as a half-turn away from where it already
  // is, so every un-hovered book span forever, doing full 360 turns.
  it('treats an at-rest book as already at its target (quaternion double cover)', () => {
    const shelf = makeShelf();

    // The raw dot product is the trap: it reads -1 here, not +1.
    shelf.getMatrixAt(50, _matrix);
    const rawDot = new THREE.Quaternion()
      .setFromRotationMatrix(_matrix)
      .dot(CLOSED_ORIENTATION);
    expect(Math.abs(rawDot)).toBeCloseTo(1);

    expect(rotateInstanceToward(shelf, 50, CLOSED_ORIENTATION, -ROTATION.step)).toBe(false);
  });

  it('leaves an un-hovered book perfectly still across many frames', () => {
    const shelf = makeShelf();
    const before = positionOf(shelf, 50);

    for (let frame = 0; frame < 200; frame++) {
      rotateInstanceToward(shelf, 50, CLOSED_ORIENTATION, -ROTATION.step);
    }

    expect(positionOf(shelf, 50).distanceTo(before)).toBeLessThan(1e-9);
    expect(angleTo(shelf, 50, CLOSED_ORIENTATION)).toBeCloseTo(0);
  });

  it('does not disturb neighbouring instances', () => {
    const shelf = makeShelf();
    const neighbourBefore = positionOf(shelf, 1);

    settle(shelf, 0, OPEN_ORIENTATION, ROTATION.step);

    expect(positionOf(shelf, 1).distanceTo(neighbourBefore)).toBeLessThan(1e-9);
    expect(angleTo(shelf, 1, CLOSED_ORIENTATION)).toBeCloseTo(0);
  });
});

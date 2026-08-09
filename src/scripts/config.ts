/**
 * Tunables for the 3D bookshelf. Everything here was previously a magic number
 * scattered through alexandria.ts.
 */

export const SHELF = {
  /** Total number of book instances in the shelf. */
  bookCount: 100,
  /** How many books before wrapping to the next shelf row. */
  booksPerRow: 20,
  /** Horizontal distance between the origins of two neighbouring books. */
  bookSpacingX: 1.555,
  /** Vertical drop from one shelf row to the next (books stack downwards). */
  rowSpacingY: 5.88,
} as const;

export const BOOK_COLOR = {
  /** Base spine colour that every book is jittered around. */
  base: [233, 150, 122] as const,
  /** Total width of the per-channel random jitter window. */
  jitter: 40,
} as const;

export const ROTATION = {
  /**
   * Radians a book turns per frame. Also doubles as the "close enough" angular
   * threshold: once a book is within one step of its target it stops, which
   * keeps it from jittering back and forth across the target orientation.
   */
  step: 0.1,
  /** How far a hovered book swings out of the shelf, in radians. */
  openAngle: Math.PI / 4,
} as const;

export const CAMERA = {
  fov: 75,
  near: 0.1,
  far: 1000,
  position: { x: 20, y: 0, z: 50 },
  movementSpeed: 10,
} as const;

export const LIGHTING = {
  /** Distance of each point light from the rig centre. */
  radius: 4,
  /** The two heights the point-light rigs sit at. */
  heights: [10, -10] as const,
  ambientIntensity: 0.4,
  pointIntensity: 1,
} as const;

export const ASSETS = {
  bookModel: "/book.obj",
  bookTexture: "texture_3.png",
} as const;

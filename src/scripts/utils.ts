import type { Group, Object3DEventMap } from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

export function randomInt(ele: number): number {
  return Math.floor(Math.random() * ele);
}

export const randomRGB = () => [randomInt(256), randomInt(256), randomInt(256)];
export const rgb = (vals: number[]) => `rgb(${vals[0]},${vals[1]},${vals[2]})`;

/** Promise wrapper around OBJLoader's callback API. */
export function loadObj(
  loader: OBJLoader,
  resourceUrl: string,
): Promise<Group<Object3DEventMap>> {
  return new Promise((resolve, reject) => {
    loader.load(
      resourceUrl,
      resolve,
      undefined,
      (error) => reject(new Error(`Failed to load ${resourceUrl}: ${error}`)),
    );
  });
}

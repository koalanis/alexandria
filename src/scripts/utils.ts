import type { Group, Object3D, Object3DEventMap } from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import * as THREE from 'three'
export function randomInt(ele: number): number {
  return Math.floor(Math.random() * ele);
}

export const randomRGB = () => [randomInt(256), randomInt(256), randomInt(256)];
export const rgb = (vals: number[]) => `rgb(${vals[0]},${vals[1]},${vals[2]})`;

export async function loadObj(loader: OBJLoader, resourceUrl: string): Promise<Group<Object3DEventMap>> {
  // return new Promise();
  return new Promise((resolve, reject) => {
    loader.load(
      // resource URL
      '/book.obj',
      // called when resource is loaded
      function (object) {

        // instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3); // 3 components (R, G, B)
        return resolve(object);
      },
      // called when loading is in progresses
      function (xhr) {
    
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    
      },
      // called when loading has errors
      function (error) {
    
        console.log('An error happened');
        return reject();
      }
    );
    
  
  });
}
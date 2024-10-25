
type Canvas2D = CanvasRenderingContext2D;

import * as THREE from 'three';

import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { loadObj } from './utils';


const qInitial = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2, 0, -1*Math.PI/2));
const qTransformation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI/4);
const qEnd = qInitial.clone().multiply(qTransformation);


function randomBrown(): number {
  let [r, g, b] = [233,150,122];
  let bound = 40;
  let rand = () => (Math.random()*bound) - (bound/2);
  
  r += rand();
  g += rand();
  b += rand();
  
  return (1 << 24 | r << 16 | g << 8 | b);
}

function createInstancedModel(object: THREE.Group<THREE.Object3DEventMap>, texture: THREE.Texture, booksPerRow: number, count: number): THREE.InstancedMesh {
  console.log(object.children[0].material)
  const geometry = object.children[0].geometry;
  console.log(geometry)
  // object.children[0].material.map = texture;
  // object.children[0].rotation.x = Math.PI / 2;
  // object.children[0].rotation.z = -Math.PI / 2;

  // object.name = "BookModel";

  // scene.add(object); 

  const material = new THREE.MeshStandardMaterial({ map: texture });
  material.onBeforeCompile = (shader) => {
    console.log(shader.vertexShader)
  };

  // const count = 100; // Number of instances
  const instancedMesh = new THREE.InstancedMesh(geometry, material, count);

  // Create a color buffer for the instances
  const colors = new Float32Array(count * 3); // 3 values (R, G, B) per instance
  // const booksPerRow = 25;
  // Set transforms and color for each instance
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let x = 0;
  let y = 0;
  for (let i = 0; i < count; i++) {
    dummy.position.set(
      x,
      y,
      0
    );
    dummy.scale.set(1, 1, Math.max(1.0, 0))
    dummy.rotation.setFromQuaternion(qInitial);

    // dummy.scale.setScalar(Math.random() * 0.5 + 0.5); // Random scaling
    dummy.updateMatrix();

    // Apply the transformation matrix to the instanced mesh
    instancedMesh.setMatrixAt(i, dummy.matrix);
    // Assign a random color to each instance
    color.setHex(randomBrown());
    color.toArray(colors, i * 3); // Store RGB values in the colors array
    instancedMesh.setColorAt(i, color);

    if ((i + 1) % booksPerRow == 0) {
      x = 0;
      y -= 5.88;
    } else {
      x += 1.555;
    }

  }
  // instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3); // 3 components (R, G, B)
  return instancedMesh;

}

type RenderContext = {
  renderer: THREE.WebGLRenderer,
  canvasElement: HTMLCanvasElement;
  camera: THREE.Camera;
  clock: THREE.Clock;
  scene: THREE.Scene;
  controls?: THREE.Controls<any>;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  isMouseDown: boolean;
}

type SimulationState = {
  numOfBooks: number;
  bookMap: Set<number>;
  booksPerRow: number;
  pickedBook: Set<number>;
}

async function populateScene(rc: RenderContext, state: SimulationState) {

  rc.scene.add(new THREE.PointLight(0xffffff, 1, 0, 0).translateZ(4).translateY(10.0));
  rc.scene.add(new THREE.PointLight(0xffffff, 1, 0, 0).translateX(-4).translateY(10.0));
  rc.scene.add(new THREE.PointLight(0xffffff, 1, 0, 0).translateX(4).translateY(10.0));
  rc.scene.add(new THREE.PointLight(0xffffff, 1, 0, 0).translateZ(-4).translateY(10.0));
  rc.scene.add(new THREE.AmbientLight(0xffffff, .4));

  rc.scene.add(new THREE.PointLight(0xffffff, 1, 0, 0).translateZ(4).translateY(-10.0));
  rc.scene.add(new THREE.PointLight(0xffffff, 1, 0, 0).translateX(-4).translateY(-10.0));
  rc.scene.add(new THREE.PointLight(0xffffff, 1, 0, 0).translateX(4).translateY(-10.0));
  rc.scene.add(new THREE.PointLight(0xffffff, 1, 0, 0).translateZ(-4).translateY(-10.0));
  rc.camera.add(new THREE.SpotLight(0xffffff, 1, 0, 0).translateZ(-4));


  const texture0 = new THREE.TextureLoader().load("texture_0.png")
  const texture = new THREE.TextureLoader().load("texture_3.png")
  const texture1 = new THREE.TextureLoader().load("texture_1.png")
  texture1.premultiplyAlpha = true
  texture.premultiplyAlpha = true
  texture0.premultiplyAlpha = true

  const loader = new OBJLoader();
  const obj = await loadObj(loader, "");
  const instanceModel = createInstancedModel(obj, texture, state.booksPerRow, state.numOfBooks);
  instanceModel.name = "BookShelf"
  state.bookMap = new Set([...new Array(100).keys()])
  console.log(state.bookMap)
  rc.scene.add(instanceModel);
}



function handleRaycasting(rc: RenderContext, state: SimulationState) {
  rc.raycaster.setFromCamera(rc.pointer, rc.camera);
  const obj = rc.scene.getObjectByName("BookShelf");
  if (obj) {
    const intersection = rc.raycaster.intersectObject(obj);
    state.pickedBook.clear();
    state.pickedBook.add(intersection[0]?.instanceId)

  }
}

function handleRenderLoop(rc: RenderContext, state: SimulationState) {
  const color = new THREE.Color();
  rc.renderer.render(rc.scene, rc.camera);
  rc.controls?.update(rc.clock.getDelta())
  handleRaycasting(rc, state);


  const obj = rc.scene.getObjectByName("BookShelf") as THREE.InstancedMesh
  // const dummy = new THREE.Object3D();

  // if (rc.isMouseDown) {
    state.pickedBook.forEach(instanceId => {
      {
        // color picking
        // obj.getColorAt(instanceId, color);
        // obj.setColorAt(instanceId, color.setHex(0xffffff));
        // obj.instanceColor.needsUpdate = true;
      }
      {
          const modelMatrix = new THREE.Matrix4();

        obj.getMatrixAt(instanceId, modelMatrix)

        // new Vector3
        // console.log(modelMatrix)
        // modelMatrix.
        
        // modelMatrix.decompose();

        // new THREE.Matrix4().make
        // if(modelMatrix.rot)
        // modelMatrix.multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), 0.01));

        if(Math.acos(new THREE.Quaternion().setFromRotationMatrix(modelMatrix).dot(qEnd)) > 0.1)
          modelMatrix.multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .1)));

        obj.setMatrixAt(instanceId, modelMatrix)
        obj.instanceMatrix.needsUpdate = true;
      }
    });

  // }

  state.bookMap.difference(state.pickedBook).forEach(instanceId => {
    let threeSpace = new THREE.Object3D();
    obj.getMatrixAt(instanceId, threeSpace.matrix)

    if(Math.acos(new THREE.Quaternion().setFromRotationMatrix( threeSpace.matrix).dot(qInitial)) > 0.0)
      threeSpace.matrix.multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.1)));


    // threeSpace.rotation.setFromQuaternion(qInitial);
    obj.setMatrixAt(instanceId, threeSpace.matrix)
    obj.instanceMatrix.needsUpdate = true;
  });



}

function createCamera(): THREE.Camera {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  camera.position.x = 20;
  camera.position.z = 50;
  camera.position.y = 0;
  return camera;
}

function createCameraControls(camera: THREE.Camera, domElement: HTMLElement): THREE.Controls<any> {
  const controls = new FirstPersonControls(camera, domElement);

  controls.activeLook = false;
  controls.movementSpeed = 10;

  return controls;
}

function registerEventsForRenderContext(rc: RenderContext) {
  function onPointerMove(event) {
    // console.log("onPointerMove", event)
    // calculate pointer position in normalized device coordinates
    // (-1 to +1) for both components
    // console.log(event)
    rc.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    rc.pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

  }
  window.addEventListener('pointermove', onPointerMove);

  function onMouseDown(event) {
    if (event) rc.isMouseDown = true;
  }
  function onMouseUp(event) {
    if (event) rc.isMouseDown = false;
  }
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

}



function createRenderer(): THREE.WebGLRenderer {

  const renderer = new THREE.WebGLRenderer({ alpha: true, });
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer;
}

export async function threeMain() {

  const renderer = createRenderer();
  const scene = new THREE.Scene();
  const camera = createCamera();
  const clock = new THREE.Clock();
  const controls = createCameraControls(camera, renderer.domElement);

  const rc: RenderContext = {
    camera,
    canvasElement: renderer.domElement,
    renderer,
    scene,
    clock,
    controls,
    pointer: new THREE.Vector2(),
    raycaster: new THREE.Raycaster(),
    isMouseDown: false
  };

  const state: SimulationState = {
    numOfBooks: 100,
    booksPerRow: 20,
    pickedBook: new Set(),
    bookMap: new Set()
  };

  registerEventsForRenderContext(rc);

  await populateScene(rc, state);

  renderer.setAnimationLoop(() => {
    handleRenderLoop(rc, state);
  });

  document.body.appendChild(renderer.domElement);
}

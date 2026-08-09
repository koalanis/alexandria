# Alexandria

An infinite library, rendered with [three.js](https://threejs.org/) on top of
[Astro](https://astro.build/). Books are drawn as a single `InstancedMesh`; the
one under your cursor swings out of the shelf, and everything else eases back in.

## Running it

```sh
npm install
npm run dev     # http://localhost:4321
```

| Command           | Action                                          |
| :---------------- | :---------------------------------------------- |
| `npm run dev`     | Dev server at `localhost:4321`                  |
| `npm run build`   | Typecheck (`astro check`) then build to `dist/` |
| `npm test`        | Run the vitest suite once                       |
| `npm run test:watch` | Re-run tests on change                       |
| `npm run preview` | Serve the production build locally              |

The shelf-geometry and rotation maths in `bookshelf.ts` are covered by
`src/scripts/bookshelf.test.ts`. It runs headless — three.js's math and scene
classes work fine in Node, only `WebGLRenderer` needs a browser.

Controls are `FirstPersonControls` with `activeLook` off: WASD / arrows move the
camera, the mouse only picks books.

## Layout

```text
public/                 book.obj + spine textures
src/
├── layouts/Layout.astro
├── pages/index.astro   mounts the canvas, reports startup failures
└── scripts/
    ├── config.ts       every tunable: counts, spacing, rotation, lights, camera
    ├── bookshelf.ts    instanced-mesh construction and the rotation step
    ├── alexandria.ts   render context, scene setup, frame loop
    ├── utils.ts        loader promise wrapper, small colour helpers
    └── 2d.ts           an earlier 2D canvas prototype, currently unwired
```

## Notes for future edits

**Tuning goes in `config.ts`.** Book count, `booksPerRow`, shelf spacing, the
swing angle and per-frame rotation step, light placement, and camera settings all
live there rather than inline.

**The rotation step guards against quaternion double cover.** A quaternion `q`
and its negation `-q` describe the same orientation, and
`Quaternion.setFromRotationMatrix` returns either one. Comparing a raw `dot`
product against a target therefore reads a book that is already at rest as a
half-turn away from where it is, which leaves every idle book spinning forever.
`rotateInstanceToward` uses `2 * acos(|dot|)` — the true angle between two
orientations — and stops once a book is within one step of its target.

**The frame loop allocates nothing.** The scratch `Matrix4`/`Quaternion` objects
in `bookshelf.ts` are module-level on purpose; moving them inside
`rotateInstanceToward` puts a few hundred throwaway objects per frame on the GC.
`SimulationState` holds a direct reference to the shelf for the same reason —
looking it up by name each frame walks the scene graph.

**The bundle is ~500kB (127kB gzipped), and that is almost entirely
`WebGLRenderer`.** Switching between `import * as THREE` and named imports
changes nothing; the bundler already tree-shakes identically either way.

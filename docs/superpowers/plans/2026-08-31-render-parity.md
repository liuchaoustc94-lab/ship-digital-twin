# Blender / Web Render Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize the Three.js default presentation of the Blender GLB with the Blender preview camera, lighting, ocean, and tone-mapping reference while preserving all model-linked platform interactions.

**Architecture:** Keep Blender presentation values in one render profile in `js/app-core.js`. Convert Blender Z-up coordinates to the exported GLTF/Web coordinate system, then apply the same centering and normalization transform already used by `js/app-features.js`. Build a presentation rig and ocean as non-selectable runtime helpers under the external model wrapper; the existing procedural demo keeps its current environment.

**Tech Stack:** Native JavaScript, Three.js 0.170 loaded from CDN, GLTFLoader, WebGL renderer, Python `unittest`, Blender 4.5.10 LTS artifact validator, GitHub Pages smoke check.

**Spec:** `docs/superpowers/specs/2026-08-31-render-parity-design.md`

## Global Constraints

- Preserve the current external-model-only active registry and metadata binding contract.
- Preserve `models/ship-blender.glb` as geometry plus engineering metadata; do not export preview cameras, lights, or ocean.
- Preserve the `?demo` fallback and all existing selection, tree, BOM, explosion, section, X-Ray, propulsion, piping, tour, and undo behaviors.
- Keep the project zero-build and CDN-based; do not add npm or runtime dependencies.
- Keep local Blender Portable files excluded from Git; only source, model artifacts, and validation assets remain tracked.

---

### Task 1: Establish the render-parity contract test

**Files:**
- Create: `tests/test_render_parity_contract.py`
- Read: `docs/superpowers/specs/2026-08-31-render-parity-design.md`

**Interfaces:**
- Consumes: the frontend source and Blender export source as plain text.
- Produces: a repeatable contract that fails until the render profile and lifecycle hooks exist.

- [x] **Step 1: Write the failing test**

```python
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
APP_CORE = (ROOT / "js" / "app-core.js").read_text(encoding="utf-8")
APP_FEATURES = (ROOT / "js" / "app-features.js").read_text(encoding="utf-8")
BLENDER_BUILD = (ROOT / "tools" / "build_ship_blender.py").read_text(encoding="utf-8")


class RenderParityContractTests(unittest.TestCase):
    def test_declares_blender_camera_and_coordinate_reference(self):
        self.assertIn("renderProfile", APP_CORE)
        self.assertRegex(APP_CORE, r"position:\s*\[205,\s*-190,\s*105\]")
        self.assertRegex(APP_CORE, r"target:\s*\[0,\s*0,\s*6\]")
        self.assertIn("blenderToGltf", APP_CORE)

    def test_declares_presentation_lights_and_ocean(self):
        for token in ("buildBlenderPresentationRig", "Presentation Ocean", "AgXToneMapping"):
            self.assertIn(token, APP_CORE)
        for token in ("KEY", "FILL", "RIM", "FRONT"):
            self.assertIn(token, APP_CORE)

    def test_external_loader_uses_and_clears_the_presentation_rig(self):
        self.assertIn("applyBlenderPresentation", APP_FEATURES)
        self.assertIn("clearBlenderPresentation", APP_FEATURES)
        self.assertIn("remove_presentation()", BLENDER_BUILD)
        self.assertIn("export_cameras=False", BLENDER_BUILD)
        self.assertIn("export_lights=False", BLENDER_BUILD)


if __name__ == "__main__":
    unittest.main()
```

- [x] **Step 2: Run the test to verify it fails for the missing contract**

Run: `python -m unittest tests.test_render_parity_contract -v`

Expected: FAIL because `renderProfile`, `blenderToGltf`, and the presentation lifecycle hooks do not yet exist in the current frontend.

### Task 2: Add the shared Blender render profile and coordinate helpers

**Files:**
- Modify: `js/app-core.js` near the `App` state declaration and `App.start`
- Test: `tests/test_render_parity_contract.py`

**Interfaces:**
- Consumes: the exact values in the render-parity specification.
- Produces: `App.renderProfile`, `App.blenderToGltf(value)`, `App.presentationFov(aspect)`, `App.applyBlenderPresentation(wrap, center, scale)`, and `App.clearBlenderPresentation()`.

- [x] **Step 1: Add the minimal profile and helpers**

```javascript
App.renderProfile={
  camera:{position:[205,-190,105],target:[0,0,6],lensMm:48,sensorWidthMm:36},
  ocean:{height:-9.55,size:340,color:'#041a2a',opacity:.62,metalness:.35,roughness:.18},
  lights:{
    KEY:{position:[45,-100,145],color:'#ffe0bd',intensity:1.6},
    FILL:{position:[-95,85,92],color:'#85b8ff',intensity:.55},
    RIM:{position:[20,30,125],color:'#5a96ff',intensity:.7},
    FRONT:{position:[0,-150,55],color:'#add0ff',intensity:.5}
  }
};
App.blenderToGltf=function(v){return new App.T.Vector3(v[0],v[2],-v[1]);};
```

- [x] **Step 2: Run the contract test to verify the minimal implementation passes**

Run: `python -m unittest tests.test_render_parity_contract -v`

Expected: PASS for the profile declarations and the existing Blender export exclusions; lifecycle assertions may remain red until Task 3 wires the loader.

### Task 3: Apply the Blender camera, lights, ocean, and renderer state on GLB load

**Files:**
- Modify: `js/app-core.js` in renderer setup, resize handling, and presentation helper implementations
- Modify: `js/app-features.js` in `_clearImportedState` and `_attachImportedGLTF`
- Test: `tests/test_render_parity_contract.py`

**Interfaces:**
- Consumes: `App.renderProfile`, `App.blenderToGltf`, and the imported GLB `center`/`scale` values.
- Produces: one runtime-only presentation rig under the external wrapper; default camera target and position match Blender after coordinate conversion and normalization; procedural environment is restored after clearing an external model.

- [x] **Step 1: Build the normalized runtime presentation rig**

Use `center` and `scale` from `_attachImportedGLTF` so every Blender-space reference point is transformed with:

```javascript
const normalizePoint=(v,center,scale)=>App.blenderToGltf(v).sub(center).multiplyScalar(scale);
```

Create a non-selectable `Group` named `BlenderPresentationRig`, place it at the external wrapper root, and add four `DirectionalLight` objects named `KEY`, `FILL`, `RIM`, and `FRONT`. Add each light's target at the normalized Blender look-at point. Add a horizontal `PlaneGeometry(2,2)` named `Presentation Ocean`, rotate it `-Math.PI/2`, scale it to the reference size, and place it at the normalized Blender ocean height.

- [x] **Step 2: Match the camera projection and renderer environment**

Compute the vertical field of view from the Blender lens and sensor width for the current canvas aspect, use `AgXToneMapping` when available with the profile exposure, and update the projection on resize. On external model load, set the normalized Blender camera position and target directly; keep `fitView` available for the explicit `F` command.

- [x] **Step 3: Wire lifecycle cleanup and preserve the procedural demo**

On `_clearImportedState`, remove the rig from the old wrapper, restore the procedural water visibility and base renderer environment, and clear the presentation references. On the built-in `ship-blender.glb` path in `_attachImportedGLTF`, hide the procedural water, build the rig, and apply the camera; arbitrary user GLBs retain the generic `fitView` path. Continue the existing tree/BOM/feature initialization without changing registry behavior.

- [x] **Step 4: Run the contract test and project artifact validation**

Run: `python -m unittest tests.test_render_parity_contract -v`

Run: `python tools/validate_blender_artifacts.py`

Expected: both exit 0; the GLB still reports required engineering IDs and does not contain `Preview Ocean`.

### Task 4: Document and visually verify parity

**Files:**
- Modify: `README.md` in the Blender and display sections
- Test: `tools/test_blender_smoke.ps1` or the existing browser/CDP smoke procedure

**Interfaces:**
- Consumes: the final runtime behavior from Task 3.
- Produces: user-facing documentation that distinguishes the Blender source render from the synchronized web presentation and a browser capture for visual QA.

- [x] **Step 1: Document the synchronization behavior**

Add a short README subsection stating that the web default view reuses the Blender reference camera, four-light layout, dark ocean presentation layer, and AgX-like tone mapping, while the GLB still contains only model geometry and metadata.

- [x] **Step 2: Run the browser smoke check**

Load `http://127.0.0.1:8021/?v=10`, wait for the external GLB, and verify:

```text
external=true
activeRegistry contains ME-001 and PP-001
base procedural model is hidden
Presentation Ocean exists under the external wrapper
the initial camera is in the Blender reference quadrant
```

Capture one screenshot and visually compare it with `models/ship-blender-preview.png`; confirm the hull, superstructure, hatch covers, cranes, bulbous bow, ocean height, and overall right-oblique composition align.

- [x] **Step 3: Run the complete regression checks**

Run: `python -m unittest discover -s tests -p "test_*.py" -v`

Run: `python tools/validate_blender_artifacts.py`

Run: `git diff --check`

Expected: all tests and validators exit 0, with no unrelated tracked file changes.

- [x] **Step 4: Commit the implementation**

```bash
git add docs/superpowers/specs/2026-08-31-render-parity-design.md docs/superpowers/plans/2026-08-31-render-parity.md tests/test_render_parity_contract.py js/app-core.js js/app-features.js README.md
git commit -m "feat: align web rendering with Blender presentation"
```

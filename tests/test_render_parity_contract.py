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

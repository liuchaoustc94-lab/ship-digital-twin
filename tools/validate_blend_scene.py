"""Run inside Blender to validate the saved .blend scene."""
import bpy


assert bpy.data.filepath.endswith("ship-blender.blend")
mesh_count = sum(1 for obj in bpy.data.objects if obj.type == "MESH")
empty_count = sum(1 for obj in bpy.data.objects if obj.type == "EMPTY")
assert mesh_count >= 253, "Saved Blender scene is missing mesh objects"
assert empty_count >= 8, "Saved Blender scene is missing system hierarchy"
assert bpy.context.scene.camera is not None, "Saved Blender scene has no presentation camera"
assert bpy.data.collections.get("Presentation") is not None, "Presentation collection is missing"

required_ids = {"HULL-OUTER", "ME-001", "GB-001", "PP-001", "PIPE-FO", "TK-FO"}
found_ids = {
    obj.get("id")
    for obj in bpy.data.objects
    if obj.get("id")
}
assert required_ids <= found_ids, "Saved Blender scene is missing required metadata ids"
print(
    "PASS: .blend opened with %d meshes, %d empties, camera, Presentation collection"
    % (mesh_count, empty_count)
)

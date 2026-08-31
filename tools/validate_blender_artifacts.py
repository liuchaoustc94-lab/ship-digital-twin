"""Validate the exported Blender artifacts without third-party packages."""
from __future__ import annotations

import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"


def read_glb(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 20:
        raise AssertionError("GLB is too small to contain a header")
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF", f"Unexpected GLB magic: {magic!r}"
    assert version == 2, f"Unexpected GLB version: {version}"
    assert total_length == len(data), "GLB header length does not match file size"

    offset = 12
    json_chunk = None
    bin_chunk = None
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == b"JSON":
            json_chunk = chunk
        elif chunk_type == b"BIN\x00":
            bin_chunk = chunk
    assert json_chunk is not None, "GLB JSON chunk is missing"
    assert bin_chunk is not None, "GLB BIN chunk is missing"
    return json.loads(json_chunk.rstrip(b" \t\r\n\x00").decode("utf-8"))


def read_png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "Preview is not a PNG"
    width, height = struct.unpack_from(">II", data, 16)
    return width, height


def main() -> None:
    blend = MODEL_DIR / "ship-blender.blend"
    glb = MODEL_DIR / "ship-blender.glb"
    preview = MODEL_DIR / "ship-blender-preview.png"
    for artifact in (blend, glb, preview):
        assert artifact.is_file(), f"Missing artifact: {artifact}"
        assert artifact.stat().st_size > 100_000, f"Artifact is unexpectedly small: {artifact}"

    document = read_glb(glb)
    assert document["asset"]["version"] == "2.0"
    assert len(document.get("nodes", [])) >= 200, "GLB has too few nodes"
    assert len(document.get("meshes", [])) >= 200, "GLB has too few meshes"
    assert len(document.get("materials", [])) >= 10, "GLB has too few materials"

    ids = {
        node.get("extras", {}).get("id")
        for node in document.get("nodes", [])
        if isinstance(node.get("extras"), dict)
    }
    required = {"HULL-OUTER", "ME-001", "GB-001", "PP-001", "PIPE-FO", "TK-FO"}
    assert required <= ids, f"Missing required metadata ids: {sorted(required - ids)}"
    names = {node.get("name") for node in document.get("nodes", [])}
    assert "Preview Ocean" not in names, "Preview-only ocean plane leaked into GLB"

    assert read_png_size(preview) == (1600, 900), "Unexpected preview dimensions"
    print(
        "PASS: GLB %d nodes / %d meshes / %d materials; preview 1600x900"
        % (len(document["nodes"]), len(document["meshes"]), len(document["materials"]))
    )


if __name__ == "__main__":
    main()

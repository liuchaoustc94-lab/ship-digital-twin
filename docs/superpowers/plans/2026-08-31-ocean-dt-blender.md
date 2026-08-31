# OCEAN·DT Blender Codex Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前已验证的 Blender 船舶数字样机生成器封装为可安装的 `ocean-dt-blender` Codex 个人插件，并在无管理员权限的 Windows 环境中完成构建、验证和安装回归。

**Architecture:** 采用 Skill + 本地 stdio MCP + 脚本层。Skill 负责自然语言触发和边界约束，MCP 负责结构化工具与结果返回，Python/PowerShell 脚本负责发现用户本地 Blender Portable、运行后台生成和验证输出。插件不携带 Blender 运行时，生成输出始终写入调用方的项目目录。

**Tech Stack:** Codex plugin manifest、个人 `marketplace.json`、Python 3 标准库、PowerShell、Blender 4.5.10 LTS Portable、JSON-RPC 2.0 line-delimited stdio MCP。

**Spec:** `docs/superpowers/specs/2026-08-31-ocean-dt-blender-design.md`

## Global Constraints

- 不把 Blender 4.5.10 Portable 运行时复制进插件包。
- 不要求管理员权限、不写入受保护系统目录。
- 不制作 Blender `bpy` 内部 Add-on 面板。
- 不改动现有 Web UI、Three.js 运行逻辑或现有 `models` 产物。
- 插件源代码和输出目录分离，生成结果写入调用方 `project_root` 的 `models` 目录。
- marketplace entry 使用 `AVAILABLE` / `ON_INSTALL` 策略并指向 `./plugins/ocean-dt-blender`。
- 所有 MCP 工具失败都返回 `isError: true` 和可读错误，不将失败伪装成成功。
- 完成插件更新后须运行插件校验、MCP 初始化/工具列表检查和实际 Blender 构建回归。

---

## 文件结构和职责

插件文件放在用户个人插件目录，当前项目只保留设计规范、实现计划和原有 Web/Blender 工程：

```text
C:\Users\chao.liu\plugins\ocean-dt-blender\
├── .codex-plugin\plugin.json       # 插件元数据和组件声明
├── .mcp.json                       # 本地 stdio MCP 启动配置
├── README.md                       # 安装、运行时和验证说明
├── skills\ocean-dt-blender\SKILL.md # 触发条件、工具选择和边界
├── scripts\
│   ├── ocean_dt_mcp.py             # MCP 协议、工具路由、进程包装
│   ├── build_ship_blender.py       # Blender 后台生成器
│   ├── build_ship_blender.ps1      # 运行时发现和 PowerShell 启动器
│   ├── test_blender_smoke.ps1      # 构建产物冒烟测试
│   ├── validate_blender_artifacts.py # GLB/PNG 验证器
│   └── validate_blend_scene.py     # Blender 内部场景验证器
├── tests\
│   ├── test_ocean_dt_mcp.py        # 运行时定位和 MCP 路由单测
│   └── test_validators.py          # 验证器输出单测
└── assets\
    ├── ship-blender-preview.png    # 插件示例预览
    └── examples\
        ├── ship-blender.blend      # 可选示例工程
        └── ship-blender.glb         # 可选网页端示例模型
```

## Task 1: 创建插件骨架、manifest 和个人 marketplace entry

**Files:**

- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\.codex-plugin\plugin.json`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\.mcp.json`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\README.md`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\skills\ocean-dt-blender\SKILL.md`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\tests\`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\assets\`
- Modify: `C:\Users\chao.liu\.agents\plugins\marketplace.json` through the scaffold helper only

**Interfaces:**

- Consumes: validated personal marketplace name `personal` and plugin name `ocean-dt-blender`.
- Produces: a validation-ready plugin root with matching folder/manifest names and a marketplace source path `./plugins/ocean-dt-blender`.

- [ ] **Step 1: Run the official scaffold helper with all required component folders.**

Run from `C:\Users\chao.liu\.codex\skills\.system\plugin-creator`:

```powershell
python .\scripts\create_basic_plugin.py ocean-dt-blender `
  --path C:\Users\chao.liu\plugins `
  --with-skills `
  --with-scripts `
  --with-assets `
  --with-mcp `
  --with-marketplace `
  --category Productivity
```

Expected: the plugin directory and personal marketplace entry are created without modifying existing `officecli` or `pymol-local` entries.

- [ ] **Step 2: Replace scaffold metadata with the approved plugin identity.**

Set `.codex-plugin/plugin.json` to contain these concrete values while retaining only paths whose files exist:

```json
{
  "name": "ocean-dt-blender",
  "version": "0.1.0",
  "description": "Generate and validate OCEAN DT ship digital-twin models with a local Blender Portable runtime.",
  "author": {"name": "Local developer"},
  "keywords": ["blender", "ship", "digital-twin", "glb", "3d"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "OCEAN DT Blender",
    "shortDescription": "Build and validate ship digital-twin models locally.",
    "longDescription": "Runs the OCEAN DT procedural ship generator with a user-local Blender 4.5 LTS Portable runtime and validates editable BLEND, web-ready GLB, metadata, scene structure, and preview outputs.",
    "developerName": "Local developer",
    "category": "Productivity",
    "capabilities": ["Read", "Write", "Local execution"],
    "defaultPrompt": [
      "Build the OCEAN DT ship model with Blender.",
      "Validate the ship GLB and Blender scene artifacts.",
      "Check whether the local Blender Portable runtime is available."
    ]
  }
}
```

- [ ] **Step 3: Add the MCP launch configuration without hard-coding a protected installation path.**

Create `.mcp.json` with `python` resolved from the current user environment:

```json
{
  "mcpServers": {
    "ocean-dt-blender": {
      "title": "OCEAN DT Blender",
      "description": "Local Blender build and validation tools for the OCEAN DT ship digital twin.",
      "command": "python",
      "args": ["./scripts/ocean_dt_mcp.py"],
      "cwd": "."
    }
  }
}
```

- [ ] **Step 4: Run the plugin validator before adding implementation files.**

```powershell
python C:\Users\chao.liu\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py C:\Users\chao.liu\plugins\ocean-dt-blender
```

Expected: validator accepts the manifest and reports no missing declared component or placeholder.

## Task 2: Implement runtime discovery and the stdio MCP server

**Files:**

- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\ocean_dt_mcp.py`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\tests\test_ocean_dt_mcp.py`

**Interfaces:**

- Consumes: `project_root`, optional `blender_exe`, and the scripts created by later tasks.
- Produces: `find_blender(project_root: Path, explicit: str | None) -> tuple[Path, str]`, `run_process(command: list[str], cwd: Path, env: dict[str, str], timeout_seconds: int) -> subprocess.CompletedProcess[str]`, `MCPServer.call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]`, and `TOOLS` schemas for four tools.

- [ ] **Step 1: Write tests for explicit and project-local runtime discovery.**

Use only the standard library and temporary directories:

```python
class RuntimeLocatorTests(unittest.TestCase):
    def test_explicit_executable_wins(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            explicit = root / "explicit" / "blender.exe"
            explicit.parent.mkdir()
            explicit.touch()
            self.assertEqual(find_blender(root, str(explicit)), (explicit, "explicit"))

    def test_project_runtime_is_discovered(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            bundled = root / "tools" / "blender-runtime" / "blender-4.5.10-windows-x64" / "blender.exe"
            bundled.parent.mkdir(parents=True)
            bundled.touch()
            self.assertEqual(find_blender(root, None), (bundled, "project-local"))

    def test_missing_runtime_has_actionable_error(self):
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaises(FileNotFoundError) as ctx:
                find_blender(Path(raw), None)
            self.assertIn("blender_exe", str(ctx.exception))
```

- [ ] **Step 2: Run the focused tests and verify they fail before the implementation exists.**

Run:

```powershell
python -m unittest C:\Users\chao.liu\plugins\ocean-dt-blender\tests\test_ocean_dt_mcp.py -v
```

Expected: import or symbol failures for the not-yet-created MCP module.

- [ ] **Step 3: Implement deterministic path normalization and runtime discovery.**

Use this candidate order:

```python
def find_blender(project_root: Path, explicit: str | None = None) -> tuple[Path, str]:
    candidates: list[tuple[Path, str]] = []
    if explicit:
        candidates.append((Path(explicit).expanduser(), "explicit"))
    env_path = os.environ.get("OCEAN_DT_BLENDER_EXE")
    if env_path:
        candidates.append((Path(env_path).expanduser(), "environment"))
    runtime_root = project_root / "tools" / "blender-runtime"
    candidates.extend((path, "project-local") for path in sorted(runtime_root.rglob("blender.exe")))
    for path, source in candidates:
        resolved = path.resolve()
        if resolved.is_file():
            return resolved, source
    raise FileNotFoundError(
        "Blender runtime not found; pass blender_exe or set OCEAN_DT_BLENDER_EXE "
        f"or place blender.exe under {runtime_root}"
    )
```

Normalize `project_root` with `Path(value or Path.cwd()).expanduser().resolve()` and create only the target `models` directory during a build.

- [ ] **Step 4: Define the four MCP tool schemas and subprocess result shape.**

Use `additionalProperties: false` on every schema. The tool arguments and returned data are:

```text
blender_status(project_root?, blender_exe?)
  -> {ok, data: {project_root, blender_exe, runtime_source, version}, error}
blender_build(project_root?, blender_exe?, render_preview?, timeout_seconds?)
  -> {ok, data: {project_root, blender_exe, outputs, mesh_count, triangle_count, stdout_tail}, error}
blender_validate(project_root?)
  -> {ok, data: {blend, glb, preview, node_count, mesh_count, material_count, metadata_ids, preview_size}, error}
blender_scene_validate(project_root?, blender_exe?, timeout_seconds?)
  -> {ok, data: {blend, stdout_tail}, error}
```

`timeout_seconds` defaults to `900` and accepts `60..1800`; `render_preview` defaults to `true`. The wrapper runs subprocesses with captured stdout/stderr so diagnostics never corrupt the MCP stdout stream.

- [ ] **Step 5: Implement JSON-RPC line transport and routing.**

Support `ping`, `initialize`, `notifications/initialized`, `tools/list`, and `tools/call`, matching the existing local plugin convention:

```python
for raw_line in sys.stdin:
    if not raw_line.strip():
        continue
    request = json.loads(raw_line)
    response = dispatch(request)
    protocol_stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
    protocol_stdout.flush()
```

Keep logs on stderr. Return tool payloads as both one JSON text content block and `structuredContent`, with `isError` set from `payload["ok"]`.

- [ ] **Step 6: Run the focused tests and verify they pass.**

```powershell
python -m unittest C:\Users\chao.liu\plugins\ocean-dt-blender\tests\test_ocean_dt_mcp.py -v
```

Expected: all runtime discovery, schema, and error-routing tests pass.

## Task 3: Port the Blender generator and parameterize the launcher

**Files:**

- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\build_ship_blender.py`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\build_ship_blender.ps1`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\test_blender_smoke.ps1`

**Interfaces:**

- Consumes: the validated source `C:\Users\chao.liu\.zcode\workspace\default\ship-digital-twin\tools\build_ship_blender.py` and environment variable `OCEAN_DT_PROJECT_ROOT`.
- Produces: `models\ship-blender.blend`, `models\ship-blender.glb`, `models\ship-blender-preview.png`, and a launcher accepting `-ProjectRoot`, `-BlenderExe`, and `-SkipPreview`.

- [ ] **Step 1: Copy the current generator into the plugin without copying runtime, logs, or `*.blend1`.**

Retain the procedural geometry, metadata IDs, presentation camera, lights, EEVEE settings, GLB export flags, and the previously fixed `setp(**kw)` and nested `nonlocal verts, faces` behavior. Do not edit the source project during the copy.

- [ ] **Step 2: Add target-root environment handling at the generator entry point.**

Replace the source-root calculation with:

```python
PROJECT_ROOT = os.path.abspath(
    os.environ.get(
        "OCEAN_DT_PROJECT_ROOT",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."),
    )
)
MODEL_DIR = os.path.join(PROJECT_ROOT, "models")
OUT = os.path.join(MODEL_DIR, "ship-blender.glb")
BLEND_OUT = os.path.join(MODEL_DIR, "ship-blender.blend")
PREVIEW_OUT = os.path.join(MODEL_DIR, "ship-blender-preview.png")
RENDER_PREVIEW = os.environ.get("OCEAN_DT_RENDER_PREVIEW", "1") != "0"
```

Keep the default behavior rendering the 1600×900 preview; when `RENDER_PREVIEW` is false, skip only `bpy.ops.render.render(write_still=True)` and leave the saved `.blend`/`.glb` flow intact.

- [ ] **Step 3: Implement the parameterized PowerShell launcher.**

The launcher must resolve absolute paths, locate the explicit `-BlenderExe`, `OCEAN_DT_BLENDER_EXE`, or project-local runtime, set `OCEAN_DT_PROJECT_ROOT`, set `OCEAN_DT_RENDER_PREVIEW`, run Blender from the target project root, and throw on nonzero exit:

```powershell
param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$BlenderExe,
  [switch]$SkipPreview
)
$projectRoot = [IO.Path]::GetFullPath($ProjectRoot)
$builder = Join-Path $PSScriptRoot 'build_ship_blender.py'
if(-not $BlenderExe) { $BlenderExe = $env:OCEAN_DT_BLENDER_EXE }
if(-not $BlenderExe) {
  $BlenderExe = Get-ChildItem (Join-Path $projectRoot 'tools\blender-runtime') -Recurse -Filter blender.exe -File |
    Select-Object -First 1 -ExpandProperty FullName
}
if(-not $BlenderExe) { throw "Blender runtime not found; pass -BlenderExe or set OCEAN_DT_BLENDER_EXE" }
$env:OCEAN_DT_PROJECT_ROOT = $projectRoot
$env:OCEAN_DT_RENDER_PREVIEW = if($SkipPreview) { '0' } else { '1' }
Push-Location $projectRoot
try {
  & $BlenderExe -b --factory-startup -P $builder
  if($LASTEXITCODE -ne 0) { throw "Blender build failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }
```

- [ ] **Step 4: Run a direct Blender build through the plugin launcher against the existing project.**

```powershell
& 'C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\build_ship_blender.ps1' `
  -ProjectRoot 'C:\Users\chao.liu\.zcode\workspace\default\ship-digital-twin' `
  -BlenderExe 'C:\Users\chao.liu\.zcode\workspace\default\ship-digital-twin\tools\blender-runtime\blender-4.5.10-windows-x64\blender.exe'
```

Expected: the existing three model artifacts are regenerated successfully and remain in the project `models` directory.

## Task 4: Port validators and expose structured validation summaries

**Files:**

- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\validate_blender_artifacts.py`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\validate_blend_scene.py`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\tests\test_validators.py`
- Modify: `C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\ocean_dt_mcp.py`

**Interfaces:**

- Consumes: a project root containing `models\ship-blender.blend`, `ship-blender.glb`, and `ship-blender-preview.png`.
- Produces: `validate_artifacts(project_root: Path) -> dict[str, Any]`, a CLI accepting `--project-root` and `--json`, and a Blender scene validator that checks any explicitly opened `.blend` path.

- [ ] **Step 1: Write validator tests against the already generated current-project artifacts.**

```python
PROJECT_ROOT = Path(r"C:\Users\chao.liu\.zcode\workspace\default\ship-digital-twin")

class ArtifactValidatorTests(unittest.TestCase):
    def test_current_artifacts_have_required_contract(self):
        result = validate_artifacts(PROJECT_ROOT)
        self.assertTrue(result["ok"])
        self.assertGreaterEqual(result["node_count"], 200)
        self.assertGreaterEqual(result["mesh_count"], 200)
        self.assertGreaterEqual(result["material_count"], 10)
        self.assertEqual(result["preview_size"], [1600, 900])
        self.assertTrue({"HULL-OUTER", "ME-001", "GB-001", "PP-001", "PIPE-FO", "TK-FO"} <= set(result["metadata_ids"]))
```

- [ ] **Step 2: Run the validator tests before porting the implementation and verify the import failure.**

```powershell
python -m unittest C:\Users\chao.liu\plugins\ocean-dt-blender\tests\test_validators.py -v
```

Expected: the not-yet-created validator module is unavailable.

- [ ] **Step 3: Port the GLB/PNG validator into a reusable function and JSON CLI.**

Keep the current GLB header/chunk checks and required IDs. Return this exact summary shape:

```python
{
    "ok": True,
    "blend": str(blend.resolve()),
    "glb": str(glb.resolve()),
    "preview": str(preview.resolve()),
    "node_count": len(document["nodes"]),
    "mesh_count": len(document["meshes"]),
    "material_count": len(document["materials"]),
    "metadata_ids": sorted(ids),
    "preview_size": [width, height],
}
```

On failure, raise an `AssertionError` in the standalone CLI and convert it to `{"ok": false, "error": "..."}` in the MCP wrapper.

- [ ] **Step 4: Parameterize the Blender-internal scene validator.**

Read `OCEAN_DT_BLEND_PATH` when present, assert `bpy.data.filepath` resolves to that file, then check at least 253 mesh objects, at least 8 Empty objects, a camera, the `Presentation` collection, and the six required metadata IDs. Print one `PASS:` line only after every assertion succeeds.

- [ ] **Step 5: Connect both validators to `blender_validate` and `blender_scene_validate`.**

`blender_validate` calls the pure-Python validator directly. `blender_scene_validate` runs:

```text
<blender.exe> -b <project_root>\models\ship-blender.blend --factory-startup -P <plugin_root>\scripts\validate_blend_scene.py
```

The MCP wrapper passes `OCEAN_DT_BLEND_PATH`, captures output, checks the process return code, and returns the absolute `.blend` path plus the captured `PASS:` summary.

- [ ] **Step 6: Run validator tests and the current-project checks.**

```powershell
python -m unittest C:\Users\chao.liu\plugins\ocean-dt-blender\tests\test_validators.py -v
python C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\validate_blender_artifacts.py `
  --project-root 'C:\Users\chao.liu\.zcode\workspace\default\ship-digital-twin'
```

Expected: the current project reports 299 GLB nodes, 253 GLB meshes, 31 materials, required metadata IDs, and a 1600×900 preview; the `.blend` check reports the saved-scene contract.

## Task 5: Complete Skill guidance, README, and sample assets

**Files:**

- Modify: `C:\Users\chao.liu\plugins\ocean-dt-blender\skills\ocean-dt-blender\SKILL.md`
- Modify: `C:\Users\chao.liu\plugins\ocean-dt-blender\README.md`
- Modify: `C:\Users\chao.liu\plugins\ocean-dt-blender\.codex-plugin\plugin.json`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\assets\ship-blender-preview.png`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\assets\examples\ship-blender.blend`
- Create: `C:\Users\chao.liu\plugins\ocean-dt-blender\assets\examples\ship-blender.glb`

**Interfaces:**

- Consumes: the four working MCP tools and the installed project-local Blender runtime.
- Produces: clear user-facing trigger guidance and reproducible no-admin commands.

- [ ] **Step 1: Write the Skill trigger and tool-selection rules.**

The Skill must trigger for OCEAN DT, ship digital twin, Blender model generation, `.blend`, `.glb`, model preview, and Blender artifact validation. It must tell Codex to:

1. Call `blender_status` before building when runtime availability is unknown.
2. Call `blender_build` for generation and report returned absolute output paths.
3. Call `blender_validate` and `blender_scene_validate` after a build or when inspecting existing artifacts.
4. Keep source project files and plugin files separate.
5. State that the Portable runtime is user-local and no administrator elevation is expected.
6. Report that the model is procedural geometry and metadata validation, not a physical-accuracy or hydrodynamics certification.

- [ ] **Step 2: Write README commands for direct use and MCP use.**

Include the exact commands:

```powershell
& 'C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\build_ship_blender.ps1' `
  -ProjectRoot (Get-Location).Path
python 'C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\validate_blender_artifacts.py' `
  --project-root (Get-Location).Path
```

Document that the plugin does not bundle or install Blender and that `OCEAN_DT_BLENDER_EXE` can override runtime discovery.

- [ ] **Step 3: Copy only the three existing sample artifacts.**

Copy the current project `models\ship-blender-preview.png`, `ship-blender.blend`, and `ship-blender.glb` into the plugin `assets` paths. Exclude `ship-blender.blend1`, build logs, and `tools\blender-runtime`.

- [ ] **Step 4: Run the plugin validator after the documentation and asset paths are complete.**

```powershell
python C:\Users\chao.liu\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py C:\Users\chao.liu\plugins\ocean-dt-blender
```

Expected: all declared files, manifest fields, and screenshot/example assets are valid.

## Task 6: End-to-end MCP smoke test, marketplace installation, and regression

**Files:**

- Modify: `C:\Users\chao.liu\.agents\plugins\marketplace.json` only through the scaffold/update helpers when required
- Modify: `C:\Users\chao.liu\plugins\ocean-dt-blender\.codex-plugin\plugin.json` through `update_plugin_cachebuster.py` for reinstall refresh
- Test: all files in `C:\Users\chao.liu\plugins\ocean-dt-blender\`

**Interfaces:**

- Consumes: a validator-clean plugin and the existing local personal marketplace.
- Produces: installed/enabled `ocean-dt-blender@personal`, passing MCP/build/validation evidence, and a fresh-task testing instruction.

- [ ] **Step 1: Smoke-test MCP initialization and tool discovery.**

Send line-delimited JSON-RPC to the configured server and assert the response contains protocol `2024-11-05` and all four tools:

```powershell
$requests = @(
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"ocean-dt-blender-smoke","version":"0.1.0"}}}',
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
) -join [Environment]::NewLine
$responses = $requests | python 'C:\Users\chao.liu\plugins\ocean-dt-blender\scripts\ocean_dt_mcp.py'
$responses
```

Expected: two JSON responses on stdout, no debug text mixed into the protocol stream, and tool names `blender_status`, `blender_build`, `blender_validate`, `blender_scene_validate`.

- [ ] **Step 2: Exercise `blender_status` and `blender_build` through MCP.**

Call the tools with `project_root` set to `C:\Users\chao.liu\.zcode\workspace\default\ship-digital-twin` and the known Portable Blender executable. Assert `ok: true`, three output files, a nonzero mesh count, and an existing output path for each artifact.

- [ ] **Step 3: Exercise both validation tools through MCP.**

Assert the GLB summary contains at least 299 nodes, 253 meshes, 31 materials, all six required IDs, and `[1600, 900]`; assert the Blender scene subprocess returns `ok: true` and includes `Presentation` in its success summary.

- [ ] **Step 4: Refresh the local plugin cache entry using the prescribed update helper.**

Read the marketplace name and replace only the Codex cachebuster:

```powershell
python C:\Users\chao.liu\.codex\skills\.system\plugin-creator\scripts\read_marketplace_name.py `
  --marketplace-path C:\Users\chao.liu\.agents\plugins\marketplace.json
python C:\Users\chao.liu\.codex\skills\.system\plugin-creator\scripts\update_plugin_cachebuster.py `
  C:\Users\chao.liu\plugins\ocean-dt-blender
```

- [ ] **Step 5: Install/reinstall from the default personal marketplace.**

```powershell
codex plugin add ocean-dt-blender@personal
codex plugin list
```

Expected: the personal marketplace remains the implicit default; no `codex plugin marketplace add` command is needed.

- [ ] **Step 6: Run the final plugin validator and preserve the complete regression evidence.**

Run the plugin validator, MCP smoke, direct Blender build, pure-Python artifact validation, and Blender scene validation once more. Report exact plugin path, installed marketplace name, Blender version, output paths, counts, and any limitation caused by the absence of a Git repository.

Because the Codex runtime loads newly installed Skills/MCP tools at task boundaries, start a new Codex task before testing natural-language invocation of `ocean-dt-blender`.

## Self-review checklist

- Every requirement in the design spec maps to Tasks 1–6: personal marketplace, no-admin runtime discovery, Skill, MCP, generator, validators, assets, outputs, and installation.
- No Blender runtime or protected-directory write is included.
- MCP tool names, argument names, environment variables, output keys, and validator function signatures are consistent across tasks.
- The plan uses the existing project artifacts for regression and does not promise physical-accuracy validation.
- No Git commit step is specified because `C:\Users\chao.liu\.zcode\workspace\default\ship-digital-twin` has no `.git` directory.

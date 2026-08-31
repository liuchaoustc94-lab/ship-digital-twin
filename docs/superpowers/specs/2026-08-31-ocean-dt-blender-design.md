# OCEAN·DT Blender Codex 插件设计

- 日期：2026-08-31
- 状态：方案已获用户确认
- 目标插件：`ocean-dt-blender`
- 目标 marketplace：个人 `personal`

## 1. 背景与目标

当前项目已经有一套经过 Blender 4.5.10 LTS 验证的程序化船模生成器，能够输出可编辑的 `.blend`、网页端可加载的 `.glb` 和渲染预览图。现将这套能力封装为 Codex 个人插件，使 Codex 能在当前项目或指定项目中直接检测 Blender、生成模型并执行结构化验证。

插件解决的是 Codex 侧的调用与分发问题，不替换现有 Web 应用，也不改变现有模型元数据契约。

## 2. 范围

### 包含

- 个人插件目录：`C:\Users\chao.liu\plugins\ocean-dt-blender`
- 插件 manifest：`.codex-plugin/plugin.json`
- 插件 Skill：描述触发条件、输入、输出、运行时约束和科学/工程边界
- 本地 stdio MCP 服务：提供 Blender 状态检查、构建和验证入口
- 生成器、PowerShell 启动器、GLB 验证器和 `.blend` 场景验证器
- 生成结果的示例预览图及可选示例模型文件
- 个人 marketplace 登记：`C:\Users\chao.liu\.agents\plugins\marketplace.json`

### 不包含

- 不把 Blender 4.5.10 Portable 运行时复制进插件包
- 不要求管理员权限、不写入受保护系统目录
- 不制作 Blender `bpy` 内部 Add-on 面板
- 不改动现有 Web UI、Three.js 运行逻辑或现有 `models` 产物
- 不把构建日志、`*.blend1` 备份或运行时缓存纳入插件包

## 3. 方案比较与选择

### 方案 A：Skill + 本地脚本

插件只提供 Skill 和 PowerShell/Python 脚本，体积最小、实现最快，但 Codex 只能依靠 Skill 指引执行脚本，缺少稳定的结构化工具入口。

### 方案 B：Skill + 本地 stdio MCP + 脚本层（采用）

Skill 负责自然语言触发和边界约束，MCP 负责结构化参数、状态和结果返回，脚本层负责实际 Blender 调用与文件验证。这样既复用已验证的构建代码，也能在 Codex 中直接调用明确的构建/校验能力；整个插件不需要额外 pip 依赖或管理员权限。

### 方案 C：把 Portable Blender 一起打包

可以实现完全自包含，但单个插件增加约 380 MB，插件缓存、分发和后续 Blender 补丁升级成本都明显增加。现有用户已经拥有可用的便携运行时，因此本版本不采用。

## 4. 目录和职责

```text
ocean-dt-blender/
├── .codex-plugin/plugin.json
├── .mcp.json
├── README.md
├── skills/ocean-dt-blender/SKILL.md
├── scripts/
│   ├── ocean_dt_mcp.py
│   ├── build_ship_blender.py
│   ├── build_ship_blender.ps1
│   ├── test_blender_smoke.ps1
│   ├── validate_blender_artifacts.py
│   └── validate_blend_scene.py
└── assets/
    ├── ship-blender-preview.png
    └── examples/
        ├── ship-blender.blend
        └── ship-blender.glb
```

- `plugin.json`：声明插件名、版本、Skill 和 MCP 入口。
- `SKILL.md`：在用户提到船舶数字样机、Blender、GLB/BLEND 生成或校验时触发；要求优先使用结构化 MCP 工具，并报告实际输出路径和校验结果。
- `ocean_dt_mcp.py`：无状态或短生命周期的 stdio MCP 包装层；不持有 Blender GUI 会话。
- `build_ship_blender.py`：在 Blender 后台进程中运行的实际场景生成器。
- 验证脚本：分别验证 GLB 容器/元数据/预览尺寸和已保存 `.blend` 场景结构。
- `assets`：只保存轻量示例结果，不保存 Blender 运行时。

## 5. MCP 接口

MCP 服务提供以下最小接口：

1. `blender_status`：返回发现到的 Blender 可执行文件、版本和是否支持预期的 4.5 LTS 运行时。
2. `blender_build`：接受可选 `project_root`、`blender_exe` 和 `render_preview`；在目标项目的 `models` 目录写入 `.blend/.glb/.png`，返回路径、文件大小和 Blender 输出摘要。
3. `blender_validate`：验证目标项目已有的 `.blend/.glb/.png`，返回节点数、网格数、材质数、必需元数据 ID 和预览尺寸。
4. `blender_scene_validate`：用 Blender 打开保存的 `.blend` 并检查网格、系统层级、相机、Presentation 集合和必需元数据。

所有工具都使用当前 Windows 用户权限执行；MCP 返回非零退出码、缺失运行时、缺失输入或验证失败时的可读错误，不把失败伪装成成功。

## 6. 运行时和路径策略

运行时优先级如下：

1. 工具调用显式传入的 `blender_exe`。
2. 目标项目下 `tools/blender-runtime/**/blender.exe`。
3. 用户本地约定的便携运行时位置；找不到时只报告安装提示，不自动写入系统目录。

默认输出根目录为调用时的 `project_root`；未指定时使用 MCP 当前工作目录。插件源代码和输出目录分离，避免把生成文件写回插件安装目录。

当前已验证运行时：Blender 4.5.10 LTS 官方 Windows Portable，位于本项目的 `tools/blender-runtime` 下。插件只发现和调用该运行时，不复制它。

## 7. 数据流

```text
Codex 自然语言请求
        ↓
Skill 识别意图与参数
        ↓
stdio MCP 规范化请求
        ↓
PowerShell/Python 启动器发现 Blender
        ↓
Blender 后台生成 .blend、.glb、预览图
        ↓
独立验证器检查容器、元数据、场景和图像尺寸
        ↓
返回绝对路径、统计量、校验结果和失败原因
```

## 8. 验证标准

- `validate_plugin.py` 通过，manifest 无占位符且路径有效。
- MCP 初始化和工具列表请求成功，stdio 输出不混入调试文本。
- `blender_status` 能发现并报告 Blender 4.5.10 LTS。
- `blender_build` 从当前项目重新生成三类产物并返回零退出码。
- GLB 验证确认 GLB 2.0、至少 200 个节点、至少 200 个网格、至少 10 个材质、必需工程 ID 完整，且 Preview Ocean 不泄漏到 GLB。
- `.blend` 验证确认至少 253 个网格、系统 Empty 层级、相机、Presentation 集合和必需工程 ID。
- 预览图为 1600×900 PNG。
- marketplace entry 指向正确的本地插件源，并使用 `AVAILABLE` / `ON_INSTALL` 策略。
- 修改后用 cachebuster 触发重装，并在新 Codex task 中验证 Skill/MCP 可见性。

## 9. 安装与更新

使用 `plugin-creator` scaffold 创建个人插件和 marketplace entry；不手写 marketplace。完成初次校验后用个人 marketplace 的名称安装。后续更新只替换 manifest 的 Codex cachebuster，再通过 `codex plugin add ocean-dt-blender@personal` 重装，并在新 task 中测试。

## 10. 成功定义

用户在 Codex 中提出“生成/重建这艘船的 Blender 模型”时，插件能在无管理员权限的 Windows 环境中调用现有 Portable Blender，生成并验证 `.blend`、`.glb` 和预览图，同时返回可复核的绝对路径与统计结果。

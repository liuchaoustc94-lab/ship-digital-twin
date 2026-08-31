# OCEAN·DT — 船舶 3D 数字样机与工程分析平台

一个纯 Web 端的 **Ship Digital Mock-up & Engineering Inspection Platform**（船舶数字样机与工程检验平台）。
无需构建工具、无需 Node —— Three.js 由 CDN 动态加载，Python 内置 HTTP 服务即可运行。

![tech](https://img.shields.io/badge/Three.js-0.170-049?logo=three.js) ![tech](https://img.shields.io/badge/ES_Modules-原生-29b) ![tech](https://img.shields.io/badge/零构建-纯静态-06c)

## 运行

```bash
cd ship-digital-twin
python -m http.server 8021
# 浏览器打开 http://localhost:8021
```

> 需要能访问 `cdn.jsdelivr.net` 或 `unpkg.com`（Three.js 运行时按需从 CDN 拉取并递归打包为 Blob 模块，双源自动回退）。

## Blender 版本

项目同时提供一版由 Blender 4.5.10 LTS 生成的高保真船舶数字模型。便携运行时位于 `tools/blender-runtime`，不需要管理员权限；重新生成 Blender 工程、GLB 和预览图：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/build_ship_blender.ps1
```

输出文件：

- `models/ship-blender.blend`：可在 Blender 中继续编辑的工程
- `models/ship-blender.glb`：可通过网页端“加载 GLB 模型”查看的模型
- `models/ship-blender-preview.png`：自动渲染的预览图

平台启动后会自动加载 `models/ship-blender.glb`，也可以在“工具 → 加载 Blender 精细船模”中重新加载；访问 `?demo` 可保留程序化示范船用于回退对比。该模型包含球鼻艏、舭龙骨、舷侧纵桁、主甲板栏杆、舱盖围板与角件、检修梯、锚杆/锚链、通风筒、吊机卷筒/司机室以及桅顶通导附件；导入时保留 Blender 导出的系统/部件工程元数据。

## 模型与功能的关联规则

平台只把当前显示的模型作为活动模型：默认是 Blender GLB，`?demo` 才使用程序化模型。活动模型适配层负责结构树、BOM、搜索、属性、爆炸、X-Ray、剖离、推进演示、导览和管路动画的对象寻址；加载新的 GLB 时会替换旧的外部模型、清理旧动画点和撤销快照，避免“画面是新模型、功能仍指向旧模型”。

GLB 节点优先使用 Blender `extras` 中的 `id/name/en/system/kind`；重复 ID 会优先绑定到系统/子装配节点，而不是其下的单个网格。推进和导览路径由 `ME-001 / GB-001 / SH-001 / PP-001` 的实际包围盒中心生成，管路粒子由活动模型中的 `PIPE-*` 网格段生成；若外部模型缺少这些语义节点，相关动画会明确提示不可用，不会在旧示范船坐标上“漂移”。

## 核心能力

| 分类 | 功能 |
|---|---|
| **观察** | 轨道/正交相机、8 向视图预设、视图立方（ViewCube）、适配/聚焦、海面场景、坐标轴 |
| **拆解** | 五级爆炸图（0–100% 滑块 + 轴向/放射两种方式）、组件级解体（如主机→缸盖/机体/底座）、剥离模式 S0–S5 |
| **剖切** | 横剖（肋位换算 Fr）、纵剖、水平（甲板高度）、六面剖面盒、剖切平面可视化 |
| **透视** | X-Ray 一键透视、外壳/上层建筑/舱口盖分项透明度、幽灵隔离模式 |
| **系统** | 六大管路系统分色、单系统隔离/显隐、流动粒子动画、推进能量流演示 |
| **数据** | 结构树 ⇄ 3D 双向联动、BOM 清单、属性面板（厂商/重量/材料/检修）、实时孪生数据（模拟 RPM/功率/温度）、状态着色 |
| **工具** | 距离/角度/坐标测量（m/mm）、标注、信息热点、搜索定位、相机书签、截图导出（深/白/透明底）、撤销/重做 |
| **教学** | 推进系统 Guided Tour（时间轴、字幕、自动运镜、0.5–2x 倍速）、行走漫游（WASD + 鼠标） |
| **扩展** | 拖入/加载外部 GLB/GLTF，自动归一化并接入结构树/搜索/属性体系 |

## 模型

内置一艘程序化生成的 200 m 示范船（`js/model.js`），123 个独立对象：

```
SHIP
├── 船体结构（外壳放样/甲板×4/横舱壁×6/肋骨框架/龙骨）
├── 上层建筑（四层甲板室/烟囱/救生艇）
├── 推进系统（主机 MAN 6G70ME-C 含子部件/齿轮箱/轴系/螺旋桨/舵系）
├── 电力系统（发电机组×3/配电板/变压器/蓄电池）
├── 管路系统（燃油/冷却水/压载/消防/淡水/压缩空气 + 泵组×5 + 阀件）
├── 通风空调 / 电气网络 / 通导设备（雷达/卫通/航行灯）
├── 甲板机械（舱口盖×3/克令吊×2/系泊/锚机）
└── 舱室分区 / 液舱（透明示意壳）
```

所有模块均为独立 Group/Mesh 并携带工程元数据（`userData.meta`），爆炸、剖切、隔离、搜索、属性全部元数据驱动。

## 文件结构

```
ship-digital-twin/
├── index.html          # UI 骨架 + Three.js CDN 动态加载器
├── css/app.css         # 深色工业风样式
└── js/
    ├── model.js        # 程序化示范船（型线放样 + 全系统建模）
    ├── app-core.js     # 场景/拾取/结构树/爆炸/剖切/相机/撤销
    └── app-features.js # 视图立方/测量/标注/热点/漫游/流动/行走/BOM/剥离/GLB
```

## 快捷键

`E` 爆炸 · `S` 剖切 · `X` X-Ray · `M` 测量 · `W` 行走 · `F` 适配 · `R` 复位 · `H` 全显 · `Del` 隐藏所选 · `P` 截图 · `Ctrl+Z/Y` 撤销/重做 · `F1` 帮助 · `Esc` 退出模式

# -*- coding: utf-8 -*-
"""OCEAN·DT Blender 高保真船模生成器
输出 GLB，节点带自定义属性（extras），与 Web 平台元数据契约完全兼容：
  系统 id: SYS-HULL/SYS-SUPER/SYS-PROP/SYS-PWR/SYS-PIPE/SYS-DECK/SYS-NAV/SYS-TANK
  部件 id: ME-001/GB-001/SH-001/PP-001/GEN-00x/HC-00x/CR-00x ...
坐标（Blender Z-up）：+X 船首 · +Z 垂向 · +Y 左舷；导出后自动转 Y-up
运行: blender -b --factory-startup -P build_ship_blender.py
"""
import bpy, bmesh, math, sys, os
from math import radians
from mathutils import Matrix, Vector

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
MODEL_DIR = os.path.join(PROJECT_ROOT, 'models')
OUT = os.path.join(MODEL_DIR, 'ship-blender.glb')
BLEND_OUT = os.path.join(MODEL_DIR, 'ship-blender.blend')
PREVIEW_OUT = os.path.join(MODEL_DIR, 'ship-blender-preview.png')

# ───────────────────────── 场景清理 ─────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ───────────────────────── 型线函数（与 Web 版一致） ─────────────────────────
def breadth(x):
    if x < -85:
        t = max(0.0, (x + 100) / 15); return 9 + 5 * math.pow(t, .8)
    if x <= 40: return 14
    if x <= 96:
        t = (x - 40) / 56; return 14 * (1 - math.pow(t, 2.1)) + .35
    return .35

def sheer(x):
    a = abs(x)
    if a <= 40: return 0
    return 1.5 * math.pow((a - 40) / 60, 1.6)

def keel(x):
    if x > 60:
        t = (x - 60) / 40; return -9 + 6 * t * t
    if x < -85:
        t = (-85 - x) / 15; return -9 + 2.4 * t * t
    return -9

def sec_scale(z):
    if z <= -7.5: return .42
    if z <= -3: return .42 + .58 * (z + 7.5) / 4.5
    return 1

DECK, D2, TT = 12, 4, -4

# ───────────────────────── 材质库 ─────────────────────────
def mat(name, color, metallic=.1, rough=.55, emit=None, ei=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        for attr in ("blend_method",):
            try: setattr(m, attr, 'BLEND')
            except Exception: pass
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    if emit:
        try:
            b.inputs["Emission Color"].default_value = (*emit, 1)
            b.inputs["Emission Strength"].default_value = ei or 1.0
        except Exception:
            pass
    return m

M_HULL  = mat('船体钢',   (.29,.36,.44), .85, .40)
M_HULL2 = mat('船底漆',   (.22,.28,.34), .85, .45)
M_DECK  = mat('甲板灰',   (.40,.47,.54), .70, .58)
M_DECK2 = mat('甲板深灰', (.30,.37,.43), .70, .60)
M_WHITE = mat('上层建筑白',(.78,.82,.86), .30, .45)
M_WHITE2= mat('甲板室白', (.84,.87,.91), .30, .42)
M_GLASS = mat('玻璃',     (.02,.08,.12), .9, .06)
M_ORANGE= mat('甲板机械橙',(.98,.50,.12), .35, .42)
M_ENG   = mat('主机蓝',   (.22,.40,.55), .60, .42)
M_ENG2  = mat('主机深蓝', (.17,.33,.46), .60, .45)
M_STEEL = mat('亮钢',     (.62,.69,.75), .90, .22)
M_DARK  = mat('深黑',     (.12,.14,.16), .40, .55)
M_COPPER= mat('青铜桨',   (.79,.63,.35), .85, .32)
M_GREEN = mat('电机绿',   (.24,.42,.32), .50, .50)
M_PANEL = mat('配电板',   (.18,.29,.24), .40, .52)
M_BAT   = mat('蓄电池',   (.19,.35,.49), .30, .50)
M_RUST  = mat('底座铁',   (.28,.34,.40), .70, .55)
M_FUN   = mat('烟囱灰',   (.42,.49,.56), .50, .48)
M_RED   = mat('航行灯红', (1,.1,.1), 0, .4, emit=(1,.05,.05), ei=8)
M_GRN   = mat('航行灯绿', (.1,1,.3), 0, .4, emit=(.05,1,.15), ei=8)
M_WHT   = mat('桅顶灯白', (1,1,1), 0, .4, emit=(1,1,1), ei=8)
M_WATER = mat('预览海面', (.015,.09,.14), .35, .18)
M_PIPE = {
    'FO': mat('燃油管',   (.98,.52,.08), .45, .40),
    'CW': mat('冷却水管', (.10,.55,.98), .45, .40),
    'BL': mat('压载管',   (.02,.82,.82), .45, .40),
    'FF': mat('消防管',   (.95,.20,.20), .45, .40),
    'FW': mat('淡水管',   (.32,.82,.45), .45, .40),
    'CA': mat('压缩空气管',(.58,.88,1.0), .45, .40),
}
M_TANK = {
    'FO': mat('燃油舱体', (1,.60,.20), .30, .45, alpha=.20),
    'BL': mat('压载舱体', (.25,.62,1.0), .30, .45, alpha=.20),
    'FW': mat('淡水舱体', (.32,.82,.45), .30, .45, alpha=.20),
}

# ───────────────────────── 造型工具 ─────────────────────────
def _active(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o

def _bevel(o, w=.08, segs=2, angle=40):
    md = o.modifiers.new('Bevel', 'BEVEL')
    md.width = w; md.segments = segs
    md.limit_method = 'ANGLE'; md.angle_limit = radians(angle)

def _smooth(o, angle=35):
    _active(o)
    try:
        bpy.ops.object.shade_auto_smooth(angle=radians(angle))
    except Exception:
        for p in o.data.polygons: p.use_smooth = True

def props(o, **kw):
    for k, v in kw.items(): o[k] = v
    return o

def setp(o, name=None, parent=None, loc=(0,0,0), rot=(0,0,0), **kw):
    if name: o.name = name
    o.location = loc; o.rotation_euler = rot
    if parent: o.parent = parent
    if kw: props(o, **kw)
    return o

def box(name, size, loc, m, parent=None, rot=(0,0,0), bevel=.06, segs=2, smooth=True, **kw):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = size
    _active(o)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel: _bevel(o, bevel, segs)
    if smooth: _smooth(o)
    o.data.materials.append(m)
    setp(o, name, parent, loc, rot)
    if kw: props(o, **kw)
    return o

def cyl(name, r1, r2, h, loc, m, parent=None, rot=(0,0,0), verts=24, smooth=True, **kw):
    bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=1, vertices=verts, location=loc)
    o = bpy.context.active_object
    o.scale = (r1, r1, h)
    _active(o); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if r2 != r1:  # 锥度
        z0 = -h / 2
        for v in o.data.vertices:
            if abs(v.co.z - z0) < 1e-4:
                v.co.x *= r2 / r1; v.co.y *= r2 / r1
    o.data.materials.append(m)
    if smooth: _smooth(o)
    setp(o, name, parent, loc, rot)
    if kw: props(o, **kw)
    return o

def sphere(name, r, loc, m, parent=None, scale=(1,1,1), **kw):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=24, ring_count=16, location=loc)
    o = bpy.context.active_object
    o.scale = (r * scale[0], r * scale[1], r * scale[2])
    _active(o); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(m); _smooth(o)
    setp(o, name, parent, loc)
    if kw: props(o, **kw)
    return o

def empty(name, parent=None, **kw):
    e = bpy.data.objects.new(name, None)
    scene.collection.objects.link(e)
    if parent: e.parent = parent
    if kw: props(e, **kw)
    return e

COLLECTIONS = {}
PRESENTATION_OBJECTS = []
def to_coll(o, cname):
    if cname not in COLLECTIONS:
        c = bpy.data.collections.new(cname)
        scene.collection.children.link(c)
        COLLECTIONS[cname] = c
    for uc in o.users_collection: uc.objects.unlink(o)
    COLLECTIONS[cname].objects.link(o)

# ───────────────────────── 1. 船体结构 ─────────────────────────
E_HULL = empty('船体结构 · HULL STRUCTURE', id='SYS-HULL', en='HULL STRUCTURE', kind='sys')
E_SUP  = empty('上层建筑 · SUPERSTRUCTURE', id='SYS-SUPER', en='SUPERSTRUCTURE', kind='sys')
E_PROP = empty('推进系统 · PROPULSION',     id='SYS-PROP', en='PROPULSION', kind='sys')
E_PWR  = empty('电力系统 · POWER SYSTEM',   id='SYS-PWR', en='POWER SYSTEM', kind='sys')
E_PIPE = empty('管路系统 · PIPING',         id='SYS-PIPE', en='PIPING SYSTEM', kind='sys')
E_DECK = empty('甲板机械 · DECK EQUIPMENT', id='SYS-DECK', en='DECK EQUIPMENT', kind='sys')
E_NAV  = empty('通导设备 · NAV & COMMS',    id='SYS-NAV', en='NAV & COMMS', kind='sys')
E_TANK = empty('液舱 · TANKS',              id='SYS-TANK', en='TANKS', kind='sys')
print('[1/9] 船体外壳放样…', flush=True)

def build_hull():
    NX, LEVELS = 96, [-9, -7.5, -5, -2, 0, 2.5, 5, 8, 10.5]
    verts, faces = [], []
    def vidx(si, li, side): return (si * (len(LEVELS) + 1) + li) * 2 + side
    for si in range(NX + 1):
        x = -100 + 200 * si / NX
        B, top, ky = breadth(x), DECK + sheer(x), keel(x)
        for lz in LEVELS:
            yy = ky + (lz + 9) / 19.5 * (top - ky - 1.5) if lz < 10.5 else top
            w = B * sec_scale(lz)
            verts += [(x, w, yy), (x, -w, yy)]
        verts += [(x, B * .99, top), (x, -B * .99, top)]
    for si in range(NX):
        for li in range(len(LEVELS)):
            a, b = vidx(si, li, 0), vidx(si + 1, li, 0)
            c, d = vidx(si + 1, li + 1, 0), vidx(si, li + 1, 0)
            faces += [(a, b, c, d), (b + 1, a + 1, d + 1, c + 1)]
    # 艉封板（x=-100 环面）
    L = len(LEVELS)
    ring = [vidx(0, li, 0) for li in range(L)] + [vidx(0, L, 0)] + \
           [vidx(0, li, 1) for li in range(L - 1, -1, -1)] + [vidx(0, L, 1)]
    faces.append(tuple(ring))
    me = bpy.data.meshes.new('hull'); me.from_pydata(verts, [], faces)
    me.validate(); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('船体外壳', me)
    scene.collection.objects.link(o)
    _active(o); o.select_set(True)
    try: bpy.ops.object.shade_auto_smooth(angle=radians(38))
    except Exception:
        for p in me.polygons: p.use_smooth = True
    o.data.materials.append(M_HULL)
    setp(o, parent=E_HULL, id='HULL-OUTER', en='OUTER HULL', system='船体结构',
         type='Shell', weight=4200000, material='EH36 高强钢', manufacturer='沪东中华')
    # 艏柱 + 艉封板贴面
    cyl('艏柱', .45, .75, 17, (100, 0, 6.5), M_HULL, E_HULL,
        id='HULL-STEM', en='STEM', system='船体结构', type='Plate', weight=8600)
    box('艉封板', (.6, 18, 22.5), (-100.1, 0, 2.2), M_HULL, E_HULL, bevel=.04,
        id='HULL-TRANSOM', en='TRANSOM', system='船体结构', type='Plate', weight=42000)
    to_coll(o, 'Hull')

def deck_strip(name, z0, x0, x1, m, parent, **kw):
    NS = 60; verts, faces = [], []
    for i in range(NS + 1):
        x = x0 + (x1 - x0) * i / NS; B = breadth(x) * .985
        verts += [(x, B, z0), (x, -B, z0)]
    for i in range(NS):
        a = i * 2
        faces += [(a, a + 2, a + 3, a + 1)]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces)
    me.validate(); me.update()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    o.data.materials.append(m)
    setp(o, parent=parent)
    props(o, **kw)
    to_coll(o, 'Hull')
    return o

def build_decks():
    deck_strip('主甲板', DECK + .0, -100, 96, M_DECK, E_HULL,
               id='DECK-MAIN', en='MAIN DECK', system='船体结构', type='Deck', weight=186000, material='AH36')
    # 主甲板梁拱
    mp = bpy.data.objects['主甲板']
    for v in mp.data.vertices:
        v.co.z += .25 * (1 - (abs(v.co.x) / 100) ** 2) * (v.co.y != 0)
    deck_strip('二层甲板', D2, -85, 56, M_DECK2, E_HULL,
               id='DECK-2ND', en='SECOND DECK', system='船体结构', type='Deck', weight=92000)
    deck_strip('内底板', TT, -98, 90, M_DECK2, E_HULL,
               id='DECK-TT', en='TANK TOP', system='船体结构', type='Deck', weight=120000)
    deck_strip('双层底板', -8.6, -88, 58, M_HULL2, E_HULL,
               id='DECK-DB', en='DOUBLE BOTTOM', system='船体结构', type='Deck', weight=88000)
    # 舷墙
    NS = 50; verts, faces = [], []
    def bulwark(side):
        nonlocal verts, faces
        base = len(verts)
        for i in range(NS + 1):
            x = -95 + 185 * i / NS; B = breadth(x) * .99
            zt = DECK + sheer(x) if abs(x) > 40 else DECK + .25
            verts += [(x, side * B, zt), (x, side * (B - .15), zt + 1.0)]
        for i in range(NS):
            a = base + i * 2
            faces += [(a, a + 2, a + 3, a + 1)]
    bulwark(1); bulwark(-1)
    me = bpy.data.meshes.new('舷墙'); me.from_pydata(verts, [], faces)
    me.validate(); me.update()
    o = bpy.data.objects.new('舷墙', me); scene.collection.objects.link(o)
    o.data.materials.append(M_HULL)
    setp(o, parent=E_HULL, id='HULL-BULW', en='BULWARK', system='船体结构', type='Plate', weight=32000)
    to_coll(o, 'Hull')

def build_bulwark_frame():
    # 横舱壁 + 肋骨 + 龙骨
    bhd = [('BHD-1', '艉尖舱壁', -88), ('BHD-2', '机舱前壁', -35), ('BHD-3', '货舱横壁 1', 0),
           ('BHD-4', '货舱横壁 2', 32), ('BHD-5', '货舱横壁 3', 64), ('BHD-6', '艏尖舱壁', 88)]
    for i, (pid, nm, x) in enumerate(bhd):
        B, h = breadth(x), DECK + sheer(x) - TT
        box(nm, (.4, B * 1.96, h), (x, 0, TT + h / 2), M_HULL2, E_HULL, bevel=.03,
            id=pid, en='BULKHEAD', system='船体结构', type='Bulkhead', weight=int(h * B * .5), material='AH36')
    e_fr = empty('肋骨框架', E_HULL, id='HULL-FRAMES', en='FRAMES', system='船体结构', kind='sub',
                 type='Sub-Assembly', weight=214000)
    x = -90
    while x <= 90:
        B, h = breadth(x) * .94, DECK + sheer(x) + 3.5
        box('肋骨 P', (.3, .55, h), (x, B, -8.5 + h / 2), M_HULL2, e_fr, bevel=.02, smooth=False)
        box('肋骨 S', (.3, .55, h), (x, -B, -8.5 + h / 2), M_HULL2, e_fr, bevel=.02, smooth=False)
        box('肋板', (.3, B * 2, 1), (x, 0, -8.2), M_HULL2, e_fr, bevel=.02, smooth=False)
        x += 10
    e_kl = empty('龙骨', e_fr, id='HULL-KEEL', en='KEEL', system='船体结构', kind='sub',
                 type='Part', weight=68000)
    box('龙骨主段', (180, 1.1, .9), (0, 0, -8.9), M_HULL2, e_kl, bevel=.04, smooth=False)
    box('龙骨艏段', (84, 1.1, .9), (78, 0, -6.2), M_HULL2, e_kl, bevel=.04, smooth=False)

# ───────────────────────── 2. 上层建筑 ─────────────────────────
print('[2/9] 上层建筑…', flush=True)
def build_super():
    tiers = [(-78, -38, 12, 15, 22), (-76, -44, 15, 18, 21), (-74, -46, 18, 21, 19.5), (-73, -47, 21, 24.2, 19.5)]
    for i, (x0, x1, z0, z1, w) in enumerate(tiers):
        m = M_WHITE2 if i == 3 else M_WHITE
        box('甲板室第%d层' % (i + 1), (x1 - x0, w * 2, z1 - z0),
            ((x0 + x1) / 2, 0, (z0 + z1) / 2), m, E_SUP, bevel=.12, segs=3,
            id='SUP-T%d' % (i + 1), en='DECKHOUSE TIER %d' % (i + 1), system='上层建筑',
            type='House', weight=52000 - i * 8000, material='铝合金')
        # 侧窗带 + 前窗
        wy, wh = (z0 + z1) / 2 + .7, (z1 - z0) * .38
        box('窗带 P', (x1 - x0 - 2.6, .12, wh), ((x0 + x1) / 2, w + .05, wy), M_GLASS, E_SUP, bevel=.02, smooth=False)
        box('窗带 S', (x1 - x0 - 2.6, .12, wh), ((x0 + x1) / 2, -w - .05, wy), M_GLASS, E_SUP, bevel=.02, smooth=False)
        if i >= 2:
            box('前窗', (.12, w * 2 - 3.2, wh), (x1 + .05, 0, wy), M_GLASS, E_SUP, bevel=.02, smooth=False)
    box('驾驶室翼台', (4, 8, .5), (-48, 10, 24.4), M_WHITE2, E_SUP, bevel=.06,
        id='SUP-WING', en='BRIDGE WING', system='上层建筑', type='Platform', weight=6800)
    box('驾驶室翼台 S', (4, 8, .5), (-48, -10, 24.4), M_WHITE2, E_SUP, bevel=.06)
    # 烟囱
    e_fn = empty('烟囱', E_SUP, id='SUP-FUNNEL', en='FUNNEL', system='上层建筑', kind='sub',
                 type='Assembly', weight=34000)
    cyl('烟囱筒体', 2.6, 1.9, 8.5, (-41, 0, 28.2), M_FUN, e_fn, verts=20,
        rot=(0, radians(-4), 0), id='SUP-FUNNEL', en='FUNNEL CASING')
    cyl('烟囱帽', 1.95, 1.95, 1.2, (-40.4, 0, 32.8), M_DARK, e_fn, verts=20,
        rot=(0, radians(-4), 0))
    # 救生艇
    e_bt = empty('救生艇', E_SUP, id='SUP-BOAT', en='LIFEBOATS', system='上层建筑', kind='sub',
                 type='Sub-Assembly', weight=8400)
    for s, tag in ((1, 'P'), (-1, 'S')):
        sphere('救生艇 ' + tag, 1.1, (-66, s * 11.6, 16.6), M_ORANGE, e_bt, scale=(2.6, 1.15, 1.05),
               id='LIFEBOAT-' + tag, en='LIFEBOAT', system='上层建筑', type='Craft',
               weight=4200, manufacturer='Norsafe')
        box('艇窗 ' + tag, (2.2, .1, .5), (-66, s * 12.45, 16.9), M_GLASS, e_bt, bevel=.02, smooth=False)

# ───────────────────────── 3. 推进系统 ─────────────────────────
print('[3/9] 推进系统…', flush=True)
def build_propulsion():
    e_me = empty('主机 · MAIN ENGINE', E_PROP, id='ME-001', en='MAIN ENGINE · MAN 6G70ME-C',
                 system='推进系统', kind='sub', compartment='机舱', deck='内底', type='Engine',
                 weight=720000, manufacturer='MAN Energy Solutions', model='6G70ME-C',
                 material='铸钢/合金', install='2023-05-12', insp='2026-06-30')
    box('主机底座', (21, 10.5, 1.6), (-58, 0, -3.3), M_RUST, e_me, bevel=.06,
        id='ME-BED', en='BEDPLATE', system='推进系统', type='Part', weight=96000)
    box('机体', (19, 9.6, 6), (-58, 0, .9), M_ENG2, e_me, bevel=.2, segs=3,
        id='ME-BLOCK', en='CYLINDER BLOCK', system='推进系统', type='Part', weight=210000)
    box('气缸体', (17, 7.5, 2.4), (-58, 0, 4.9), M_ENG, e_me, bevel=.15,
        id='ME-AFRAME', en='FRAME BOX', system='推进系统', type='Part', weight=88000)
    for i in range(5):
        x = -65.5 + i * 3.8
        cyl('气缸盖 %d' % (i + 1), 1.45, 1.45, 2.6, (x, 0, 7.3), M_ENG, e_me, verts=18,
            id='ME-H%d' % (i + 1), en='CYLINDER HEAD', system='推进系统', type='Part', weight=4200)
        cyl('缸盖罩 %d' % (i + 1), 1.7, 1.7, 1.1, (x, 0, 9), M_ENG2, e_me, verts=18)
        cyl('排气短管 %d' % (i + 1), .5, .5, 1.6, (x, 0, 10.1), M_STEEL, e_me, verts=12)
    cyl('涡轮增压器', 1.5, 1.5, 3.2, (-50.5, 3.4, 7.8), M_STEEL, e_me, verts=20,
        rot=(radians(90), 0, 0),
        id='ME-TURBO', en='TURBOCHARGER', system='推进系统', type='Part', weight=12000, manufacturer='ABB')
    cyl('排气管', 1.0, 1.0, 17, (-58, -2.2, 10.6), M_DARK, e_me, verts=16, rot=(0, radians(90), 0),
        id='ME-EXH', en='EXHAUST MANIFOLD', system='推进系统', type='Part', weight=9800)
    # 齿轮箱
    e_gb = empty('齿轮箱', E_PROP, id='GB-001', en='GEARBOX', system='推进系统', kind='sub',
                 compartment='机舱', type='Machinery', weight=46000, manufacturer='Renk AG')
    box('齿轮箱体', (6, 7, 5), (-41.5, 0, -.9), M_ENG, e_gb, bevel=.18,
        id='GB-001', en='GEARBOX', system='推进系统', type='Machinery', weight=46000)
    cyl('输入轴', .9, .9, 5, (-41.5, 0, 2.6), M_STEEL, e_gb, rot=(0, radians(90), 0), verts=14)
    # 轴系
    e_sh = empty('轴系 · SHAFT LINE', E_PROP, id='SH-001', en='SHAFT LINE', system='推进系统', kind='sub',
                 compartment='机舱', type='Assembly', weight=66000)
    cyl('中间轴', .5, .5, 56, (-70, 0, -3.3), M_STEEL, e_sh, rot=(0, radians(90), 0), verts=16,
        id='SH-SHAFT', en='INTERMEDIATE SHAFT', system='推进系统', type='Shaft', weight=52000)
    cyl('艉轴', .62, .62, 8, (-96.5, 0, -3.3), M_STEEL, e_sh, rot=(0, radians(90), 0), verts=16)
    cyl('艉轴管', 1.25, 1.0, 7, (-98.5, 0, -3.3), M_HULL2, e_sh, rot=(0, radians(90), 0), verts=16,
        id='SH-TUBE', en='STERN TUBE', system='推进系统', type='Part', weight=14000)
    # 螺旋桨
    e_pp = empty('螺旋桨 · PROPELLER', e_sh, id='PP-001', en='PROPELLER · 5叶定距',
                 system='推进系统', kind='sub', compartment='船外', type='Propeller',
                 weight=28000, manufacturer='MMG', diameter='8.4 m', material='镍铝青铜')
    e_pp.location = (-104.6, 0, -3.3)
    cyl('桨毂', 1.15, .5, 2.6, (0, 0, 0), M_COPPER, e_pp, rot=(0, radians(90), 0), verts=18,
        id='PP-HUB', en='PROP HUB', system='推进系统', type='Part', weight=6400)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-104.6, 0, -3.3))
    bl = bpy.context.active_object
    bl.scale = (2.2, 4.6, .32); _active(bl)
    bpy.ops.object.transform_apply(scale=True)
    _bevel(bl, .1, 2); _smooth(bl); bl.data.materials.append(M_COPPER)
    bl.data.transform(Matrix.Translation((0, 2.6, 0)) @ Matrix.Rotation(radians(24), 4, 'Y'))
    setp(bl, '桨叶 1', e_pp, id='PP-B1', en='BLADE 1', system='推进系统', type='Blade', weight=4200)
    for i in range(1, 5):
        b2 = bl.copy(); b2.data = bl.data.copy()
        scene.collection.objects.link(b2)
        b2.rotation_euler.x = i * math.tau / 5
        setp(b2, '桨叶 %d' % (i + 1), e_pp, id='PP-B%d' % (i + 1), en='BLADE %d' % (i + 1),
             system='推进系统', type='Blade', weight=4200)
    # 舵系
    e_rd = empty('舵系 · RUDDER', E_PROP, id='RD-001', en='RUDDER SYSTEM', system='推进系统', kind='sub',
                 compartment='舵机舱', type='Assembly', weight=60000)
    box('舵叶', (1.3, 3.6, 7), (-103.5, 0, -4.6), M_HULL2, e_rd, bevel=.12,
        id='RD-BLADE', en='RUDDER BLADE', system='推进系统', type='Part', weight=38000)
    cyl('舵杆', .35, .35, 7, (-102.9, 0, -.6), M_STEEL, e_rd, verts=12)
    box('舵机', (4.5, 4.5, 3), (-96, 0, 4.2), M_ENG, e_rd, bevel=.15,
        id='SG-001', en='STEERING GEAR', system='推进系统', type='Machinery', weight=22000,
        manufacturer='Hydramarine')

# ───────────────────────── 4. 电力系统 ─────────────────────────
print('[4/9] 电力系统…', flush=True)
def build_power():
    for i in range(3):
        y = -6 + i * 6
        e_g = empty('发电机组 %d' % (i + 1), E_PWR, id='GEN-00%d' % (i + 1),
                    en='DG %d · CAT C3512' % (i + 1), system='电力系统', kind='sub',
                    compartment='机舱', deck='内底', type='Generator', weight=52000,
                    manufacturer='Caterpillar', install='2023-05-18', insp='2026-07-02')
        box('机座 %d' % (i + 1), (5.2, 3, .6), (-80, y, -3.4), M_RUST, e_g, bevel=.04, smooth=False)
        box('机身 %d' % (i + 1), (3.9, 2.4, 2.7), (-80, y, -1.7), M_GREEN, e_g, bevel=.14,
            id='GEN-00%d' % (i + 1), en='DG %d' % (i + 1), system='电力系统', type='Generator', weight=52000)
        cyl('排气歧管 %d' % (i + 1), .5, .5, 1.8, (-78.6, y, -.2), M_STEEL, e_g, rot=(0, radians(90), 0), verts=12)
        cyl('排烟管 %d' % (i + 1), .32, .32, 4.5, (-81, y, 1.6), M_DARK, e_g, verts=10)
    e_sb = empty('主配电板', E_PWR, id='SB-001', en='MAIN SWITCHBOARD', system='电力系统', kind='sub',
                 compartment='机舱', type='Panel', weight=18000, manufacturer='ABB')
    for i in range(4):
        box('配电屏 %d' % (i + 1), (.9, 1.9, 3.4), (-36.5, -3 + i * 2, 1), M_PANEL, e_sb, bevel=.05)
    box('母排指示', (.16, 7.4, .4), (-36.0, 0, 2.7), mat('母排绿', (.1,.95,.5), emit=(.1,.95,.5), ei=3), e_sb,
        bevel=.02, smooth=False)
    box('变压器', (2.3, 2.3, 2.7), (-36.5, 5.5, .4), M_STEEL, E_PWR, bevel=.12,
        id='TR-001', en='TRANSFORMER 2200kVA', system='电力系统', type='Machinery', weight=12000, manufacturer='ABB')
    e_bat = empty('应急蓄电池组', E_PWR, id='BT-001', en='EMERGENCY BATTERY', system='电力系统', kind='sub',
                  compartment='机舱', type='Battery', weight=8600)
    box('电池柜', (2.6, 1.3, 2.2), (-36.5, 9, .1), M_DARK, e_bat, bevel=.05)
    for i in range(4):
        box('电池单元 %d' % (i + 1), (.5, 1.1, .8), (-37.6 + i * .75, 9, .45), M_BAT, e_bat, bevel=.02, smooth=False)

# ───────────────────────── 5. 管路系统 ─────────────────────────
print('[5/9] 管路系统…', flush=True)
PIPES = [
    ('FO', '燃油系统', 'FUEL OIL', .3, [
        [(-73, -4, -5.2), (-73, -4, -2.8), (-68, -1.5, -2.8), (-62, -1.5, -2.6)],
        [(-73, 4, -5.2), (-70, 3, -2.8), (-64, 1.5, -2.8), (-62, 1.2, -2.7)]]),
    ('CW', '冷却水系统', 'COOLING WATER', .38, [
        [(-60, -2, -3), (-72, -4, -3), (-84, -6, -3.6), (-88, -8, -5)],
        [(-60, 2, -3), (-72, 4, -3), (-84, 6, -3.6), (-88, 8, -5)]]),
    ('BL', '压载水系统', 'BALLAST', .42, [
        [(-18, 8, -5.5), (-28, 7, -3.5), (-33, 7, -3), (-33, 9.5, 11)],
        [(30, 8, -5.5), (10, 8, -4), (-20, 8.2, -4), (-33, 7.5, -3)],
        [(-33, 9.5, 11), (-60, 10, 11.2), (-90, 9, 11.4), (-97, 8, 9)]]),
    ('FF', '消防系统', 'FIRE FIGHTING', .28, [
        [(-80, 0, 12.8), (-40, 0, 12.9), (0, 0, 13), (40, 0, 13.2), (80, 0, 13.6)]]),
    ('FW', '淡水系统', 'FRESH WATER', .2, [
        [(-76, -4, 13.4), (-70, -4, 13.4), (-66, -3, 15.8), (-56, -3, 15.8), (-50, 0, 15.9)]]),
    ('CA', '压缩空气', 'COMPRESSED AIR', .18, [
        [(-63, -3, -1.6), (-70, -4, -2), (-78, -4.5, -2.2)]]),
]
curve_objs = []
def build_piping():
    for pid, nm, en, r, lines in PIPES:
        e_p = empty(nm, E_PIPE, id='PIPE-' + pid, en=en, system='管路系统', kind='sub',
                    type='Pipeline', weight=6000)
        for ci, pts in enumerate(lines):
            cu = bpy.data.curves.new('%s管段%d' % (nm, ci + 1), 'CURVE')
            cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 4
            sp = cu.splines.new('NURBS')
            sp.points.add(len(pts) - 1)
            for i, p in enumerate(pts):
                sp.points[i].co = (p[0], p[1], p[2], 1)
            sp.use_endpoint_u = True
            o = bpy.data.objects.new('%s管段 %d' % (nm, ci + 1), cu)
            scene.collection.objects.link(o)
            o.data.materials.append(M_PIPE[pid])
            setp(o, parent=e_p, id='PIPE-%s-%d' % (pid, ci + 1), en=en + ' LINE',
                 system='管路系统', type='Pipeline', weight=1200 + ci * 400)
            curve_objs.append(o)
        # 阀件
        if pid in ('FO', 'FF', 'CW'):
            p0 = lines[0][1]
            cyl(nm + '阀件', .5, .5, .55, (p0[0], p0[1], p0[2] + .8), M_PIPE[pid], e_p, verts=12,
                id='VLV-' + pid, en='VALVE', system='管路系统', type='Valve', weight=85)
    # 泵组
    pumps = [
        ('PUMP-F01', '燃油泵 01', 'FUEL PUMP 01', 'FO', (-68, 4.2, -3.1)),
        ('PUMP-F02', '燃油泵 02', 'FUEL PUMP 02', 'FO', (-64, 4.2, -3.1)),
        ('PUMP-C01', '冷却泵', 'COOLING PUMP', 'CW', (-74, -4.6, -3.1)),
        ('PUMP-B01', '压载泵', 'BALLAST PUMP', 'BL', (-30, 6, -3.1)),
        ('PUMP-FW1', '淡水泵', 'FRESH WATER PUMP', 'FW', (-40, -6.5, -3.1)),
    ]
    for pid, nm, en, sysk, (x, y, z) in pumps:
        e_pu = empty(nm, E_PIPE, id=pid, en=en, system='管路系统', kind='sub', compartment='机舱',
                     deck='内底', type='Pump', weight=850, manufacturer='Grundfos')
        cyl('泵座', 1.05, 1.15, .5, (x, y, z - .2), M_RUST, e_pu, verts=16, smooth=False)
        cyl('泵体', .72, .78, 1.5, (x, y, z + .7), M_PIPE[sysk], e_pu, verts=18,
            id=pid, en=en, system='管路系统', type='Pump', weight=850)
        cyl('电机', .32, .34, 1.1, (x, y, z + 1.9), M_STEEL, e_pu, verts=12)

# ───────────────────────── 6. 甲板机械 ─────────────────────────
print('[6/9] 甲板机械…', flush=True)
def build_deck():
    for i, x in enumerate((-14, 16, 47)):
        e_h = empty('货舱%d舱盖' % (i + 1), E_DECK, id='HC-00%d' % (i + 1), en='HATCH COVER %d' % (i + 1),
                    system='甲板机械', deck='主甲板', kind='sub', type='Hatch Cover', weight=78000)
        box('舱盖体 %d' % (i + 1), (24, 14, 2.4), (x, 0, 13.2), M_DECK, e_h, bevel=.08,
            id='HC-00%d' % (i + 1), en='HATCH COVER', system='甲板机械', type='Hatch Cover', weight=78000)
        box('舱盖板 %d' % (i + 1), (24.6, 14.6, .5), (x, 0, 14.65), M_ORANGE, e_h, bevel=.05,
            id='HC-00%dC' % (i + 1), en='COVER PLATE', system='甲板机械', type='Part', weight=52000)
    for i, px in enumerate((1, 31)):
        e_c = empty('克令吊 %d' % (i + 1), E_DECK, id='CR-00%d' % (i + 1), en='DECK CRANE %d' % (i + 1),
                    system='甲板机械', deck='主甲板', kind='sub', type='Crane', weight=168000,
                    manufacturer='Huisman')
        cyl('吊基座', 1.6, 1.9, 3.2, (px, 10.5, 13.6), M_RUST, e_c, verts=18)
        box('吊塔', (2.2, 2.2, 8), (px, 10.5, 19), M_ORANGE, e_c, bevel=.1,
            id='CR-00%d' % (i + 1), en='CRANE TOWER', system='甲板机械', type='Part', weight=96000)
        box('吊机房', (2.6, 2.6, 2.6), (px, 10.5, 23.5), M_STEEL, e_c, bevel=.12)
        jib = box('吊臂 %d' % (i + 1), (15, 1.1, 1.1), (px + 6.2, 10.5, 25.4), M_ORANGE, e_c, bevel=.06,
                  id='CR-00%dJ' % (i + 1), en='CRANE JIB', system='甲板机械', type='Part', weight=36000)
        jib.rotation_euler.y = radians(-13)
        cyl('吊索', .07, .07, 9, (px + 12.4, 10.5, 21.4), M_STEEL, e_c, verts=8)
        box('吊钩', (1.2, 1.2, 1), (px + 12.4, 10.5, 17), M_DARK, e_c, bevel=.05, smooth=False)
    e_mo = empty('系泊设备', E_DECK, id='EQ-MOOR', en='MOORING EQUIPMENT', system='甲板机械', kind='sub',
                 deck='主甲板', type='Sub-Assembly', weight=46000)
    for s in (1, -1):
        box('系泊绞车 %s' % ('P' if s > 0 else 'S'), (3, 2.2, 1.6), (-95, s * 6, 13.6), M_ORANGE, e_mo, bevel=.08)
        cyl('滚筒 %s' % ('P' if s > 0 else 'S'), 1.1, 1.1, .7, (-96.2, s * 6, 14.7), M_STEEL, e_mo,
            rot=(radians(90), 0, 0), verts=16)
    for i in range(8):
        x = -95 + i * 26; B = breadth(x) - 1.6
        for s in (1, -1):
            cyl('带缆桩', .25, .28, 1.2, (x, s * B, 13.4), M_HULL2, e_mo, verts=10, smooth=False)
            box('桩头', (1.1, .45, .3), (x, s * B, 14.05), M_HULL2, e_mo, bevel=.03, smooth=False)
    e_wl = empty('锚机', E_DECK, id='EQ-WIND', en='WINDLASS', system='甲板机械', kind='sub',
                 deck='艏甲板', type='Machinery', weight=14000)
    for s, tag in ((1, 'P'), (-1, 'S')):
        box('锚机体 ' + tag, (2.6, 2, 1.5), (86, s * 3.4, 15), M_ORANGE, e_wl, bevel=.08)
        cyl('锚链轮 ' + tag, 1, 1, .8, (86, s * 3.4, 16.1), M_STEEL, e_wl, rot=(radians(90), 0, 0), verts=14)

# ───────────────────────── 7. 通导设备 ─────────────────────────
print('[7/9] 通导设备…', flush=True)
def build_nav():
    e_m = empty('雷达桅', E_NAV, id='NV-MAST', en='RADAR MAST', system='通导设备', kind='sub',
                deck='罗经甲板', type='Mast', weight=6800)
    cyl('桅杆', .24, .32, 9, (-60, 0, 28.5), M_STEEL, e_m, verts=12)
    box('桅桁 P', (3.4, .25, .25), (-60, 1.6, 31.5), M_STEEL, e_m, bevel=.03, smooth=False)
    box('桅桁 S', (3.4, .25, .25), (-60, -1.6, 31.5), M_STEEL, e_m, bevel=.03, smooth=False)
    box('桅桁 V', (.25, .25, 3.4), (-60, 0, 30), M_STEEL, e_m, bevel=.03, smooth=False)
    box('X波段雷达', (5.2, .45, .3), (-60, 0, 33.4), M_WHITE, e_m, bevel=.05,
        id='NV-RADAR', en='X-BAND RADAR', system='通导设备', type='Radar', weight=320, manufacturer='Furuno')
    sphere('卫通天线罩', 1.05, (-64, 0, 25.6), M_WHITE, E_NAV,
           id='NV-SAT', en='SATCOM DOME', system='通导设备', type='Antenna', weight=640)
    sphere('卫通天线罩 2', .8, (-56, 0, 25.3), M_WHITE, E_NAV,
           id='NV-SAT2', en='VSAT DOME', system='通导设备', type='Antenna', weight=520)
    sphere('左舷灯', .32, (-48.6, 13.5, 25), M_RED, E_NAV,
           id='NL-P', en='PORT LIGHT', system='通导设备', type='Light', weight=8)
    sphere('右舷灯', .32, (-48.6, -13.5, 25), M_GRN, E_NAV,
           id='NL-S', en='STARBOARD LIGHT', system='通导设备', type='Light', weight=8)
    sphere('桅顶灯', .3, (-60, 0, 33.9), M_WHT, E_NAV,
           id='NL-MH', en='MASTHEAD LIGHT', system='通导设备', type='Light', weight=8)

# ───────────────────────── 8. 液舱 ─────────────────────────
print('[8/9] 液舱…', flush=True)
def build_tanks():
    tanks = [
        ('TK-FO', '燃油舱', 'FUEL OIL TANK', 'FO', (-73, 0, -6.6), (18, 20, 4.6)),
        ('TK-B1', '压载舱 P', 'BALLAST TANK P', 'BL', (-5, 7, -6.6), (30, 11, 4.6)),
        ('TK-B2', '压载舱 S', 'BALLAST TANK S', 'BL', (-5, -7, -6.6), (30, 11, 4.6)),
        ('TK-FP', '艏压载舱', 'FWD BALLAST', 'BL', (76, 0, -6), (16, 10, 4)),
        ('TK-FW', '淡水舱', 'FRESH WATER TK', 'FW', (-38, -6.5, -6.4), (6, 8, 4.4)),
    ]
    for tid, nm, en, sysk, loc, size in tanks:
        e_t = empty(nm, E_TANK, id=tid, en=en, system='液舱', kind='sub', compartment='双层底',
                    deck='双层底', type='Tank', weight='%d t' % int(size[0] * size[1] * size[2] * .85))
        box(nm + '体', size, loc, M_TANK[sysk], e_t, bevel=.06,
            id=tid, en=en, system='液舱', type='Tank')

# ───────────────────────── 预览场景 ─────────────────────────
def look_at(o, target):
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()

def add_area_light(name, loc, energy, color, size):
    bpy.ops.object.light_add(type='AREA', location=loc)
    o = bpy.context.active_object
    o.name = name
    o.data.energy = energy
    o.data.color = color
    o.data.shape = 'DISK'
    o.data.size = size
    look_at(o, (0, 0, 5))
    to_coll(o, 'Presentation')
    PRESENTATION_OBJECTS.append(o)
    return o

def build_presentation():
    world = scene.world or bpy.data.worlds.new('OCEAN DT World')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (.006, .018, .035, 1)
        bg.inputs['Strength'].default_value = .28

    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, -9.55))
    water = bpy.context.active_object
    water.name = 'Preview Ocean'
    water.scale = (170, 170, 1)
    water.data.materials.append(M_WATER)
    to_coll(water, 'Presentation')
    PRESENTATION_OBJECTS.append(water)

    bpy.ops.object.camera_add(location=(205, -190, 105))
    camera = bpy.context.active_object
    camera.name = 'Presentation Camera'
    camera.data.lens = 48
    camera.data.sensor_width = 36
    look_at(camera, (0, 0, 6))
    to_coll(camera, 'Presentation')
    PRESENTATION_OBJECTS.append(camera)
    scene.camera = camera

    add_area_light('Key Light', (45, -100, 145), 125000, (1.0, .84, .68), 85)
    add_area_light('Fill Light', (-95, 85, 92), 90000, (.52, .72, 1.0), 75)
    add_area_light('Rim Light', (20, 30, 125), 110000, (.35, .58, 1.0), 65)
    add_area_light('Front Fill', (0, -150, 55), 85000, (.68, .80, 1.0), 100)

    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.render.filepath = os.path.abspath(PREVIEW_OUT)
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass

def remove_presentation():
    for o in list(PRESENTATION_OBJECTS):
        if o and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    PRESENTATION_OBJECTS.clear()

# ───────────────────────── 9. 导出 ─────────────────────────
build_hull()
build_decks()
build_bulwark_frame()
build_super()
build_propulsion()
build_power()
build_piping()
build_deck()
build_nav()
build_tanks()

print('[9/9] 曲线转网格并导出…', flush=True)
if curve_objs:
    bpy.ops.object.select_all(action='DESELECT')
    for o in curve_objs: o.select_set(True)
    bpy.context.view_layer.objects.active = curve_objs[0]
    bpy.ops.object.convert(target='MESH')
    for o in curve_objs:
        for p in o.data.polygons: p.use_smooth = True

os.makedirs(MODEL_DIR, exist_ok=True)
build_presentation()
print('[9/9] 渲染 Blender 预览图…', flush=True)
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND_OUT))
print('已保存 Blender 工程: %s (%.1f MB)' % (BLEND_OUT, os.path.getsize(BLEND_OUT) / 1048576), flush=True)
remove_presentation()

# 统计
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
print('网格对象: %d · 三角形: %d' % (sum(1 for o in scene.objects if o.type == 'MESH'), tris), flush=True)

OUT = os.path.abspath(OUT)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB',
    export_extras=True, export_apply=True,
    export_cameras=False, export_lights=False,
    export_yup=True)
print('已导出: %s (%.1f MB)' % (OUT, os.path.getsize(OUT) / 1048576), flush=True)

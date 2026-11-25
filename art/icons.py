"""Item icons, one 96x96 picture per item id.

blender --background --factory-startup --python art/icons.py -- <out dir> <json dir>
Writes icons.png (8 per row) and icons.json (item id -> number).
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import kit  # noqa: E402
import numpy as np  # noqa: E402
from kit import *  # noqa: E402,F403

args = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(args[0])
rad = math.radians
METAL = {1: 0xD88A4E, 2: 0xC3CCD6, 3: 0xA9C4F0}
DARK = {1: 0x8A4F2C, 2: 0x6B7482, 3: 0x5B6AA8}


def wood_mat():
    return toon("wood", 0x8A5A32)


def ore(body, gem):
    R = toon("rock", body, dark=0.66)
    G = toon("gem", gem, dark=0.7, light=1.3)
    rnd = random.Random(gem)
    for x, y, z, s in ((0, 0.1, 0, 0.62), (-0.42, -0.2, -0.22, 0.36), (0.42, -0.16, -0.2, 0.38)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
        ob = bpy.context.object
        for v in ob.data.vertices:
            v.co *= 0.88 + rnd.random() * 0.2
        ob.scale = (s, s, s * 0.85)
        apply(ob)
        ob.location = (x, y, z)
        kit._finish(ob, "c", R, None, False, 0.05)
    for x, z, a, s in ((-0.1, 0.3, 14, 1.0), (0.26, 0.2, -26, 0.8), (-0.4, 0.02, 34, 0.75), (0.1, -0.16, -8, 0.7)):
        cone("g", (x, -0.52, z), 0.15 * s, 0.0, 0.5 * s, G, rot=(rad(38), rad(-a), 0), seg=5, bevel=0, outline=0.035)


def log(bark, heart):
    B = toon("bark", bark)
    H = toon("heart", heart, dark=0.8)
    for x, z in ((-0.3, -0.25), (0.32, -0.25), (0.0, 0.28)):
        p = pivot("p", (x, 0, z))
        p.rotation_euler = (rad(62), 0, rad(24))
        cone("log", (0, 0, 0), 0.3, 0.3, 1.2, B, p, outline=0.05)
        cone("end", (0, 0, 0.605), 0.24, 0.24, 0.03, H, p, outline=0.0, bevel=0)
        ring("r", (0, 0, 0.625), 0.13, 0.02, B, p, outline=0)


def hide(fur=0x9A7A5C):
    F = toon("fur", fur)
    I = toon("inside", 0xE0C4A0, dark=0.8)
    box("body", (0, 0, 0), (0.95, 0.12, 1.0), F, outline=0.05, bevel=0.12, rot=(rad(-16), 0, 0))
    for s in (-1, 1):
        for q in (-1, 1):
            ball("paw", (0.52 * s, 0, 0.42 * q), (0.24, 0.09, 0.2), F, outline=0.05)
    box("in", (0, -0.1, 0), (0.66, 0.05, 0.72), I, outline=0, bevel=0.1, rot=(rad(-16), 0, 0))


def crystal():
    G = toon("gem", 0xFFE0A0, dark=0.72, light=1.15)
    P = toon("gem2", 0xFFB8D8, dark=0.75, light=1.15)
    for x, z, a, s, m in ((0, 0.05, 0, 1.0, G), (-0.36, -0.22, 24, 0.66, P), (0.38, -0.2, -26, 0.7, P)):
        p = pivot("p", (x, 0, z))
        p.rotation_euler.y = rad(-a)
        cone("up", (0, 0, 0.42 * s), 0.3 * s, 0.0, 0.62 * s, m, p, seg=6, bevel=0, outline=0.045)
        cone("mid", (0, 0, -0.08 * s), 0.24 * s, 0.3 * s, 0.4 * s, m, p, seg=6, bevel=0, outline=0.045)


def thread():
    R = toon("thread", 0xC14A6A, dark=0.7)
    W = wood_mat()
    p = pivot("p", (0, 0, 0))
    p.rotation_euler = (rad(14), rad(-24), 0)
    cone("core", (0, 0, 0), 0.4, 0.4, 0.8, R, p, outline=0.05)
    for i in range(6):
        ring("wind", (0, 0, -0.32 + i * 0.128), 0.4, 0.055, R, p, outline=0.016)
    for z in (-0.5, 0.5):
        cone("end", (0, 0, z), 0.56, 0.56, 0.14, W, p, outline=0.05)
    for i in range(8):
        ball("tail", (0.42 + 0.06 * i, -0.2, -0.3 - 0.05 * i + 0.06 * math.sin(i * 1.4)), 0.045, R, None, outline=0.02, seg=12)


def tilted(a=-40):
    p = pivot("p", (0, 0, 0))
    p.rotation_euler = (rad(6), rad(-a), 0)
    return p


def pickaxe():
    p = tilted()
    M = toon("m", 0xB8C0C8)
    cone("shaft", (0, 0, -0.1), 0.085, 0.07, 1.6, wood_mat(), p, outline=0.045)
    for s in (-1, 1):
        cone("tine", (0.38 * s, 0, 0.5), 0.14, 0.01, 0.72, M, p, outline=0.045, rot=(0, rad(108 * s), 0), bevel=0)
    box("eye", (0, 0, 0.56), (0.28, 0.24, 0.24), M, p, outline=0.04)


def hatchet():
    p = tilted()
    M = toon("m", 0xB8C0C8)
    cone("shaft", (0, 0, -0.1), 0.085, 0.07, 1.6, wood_mat(), p, outline=0.045)
    cone("edge", (-0.3, 0, 0.45), 0.42, 0.16, 0.5, M, p, outline=0.045, rot=(0, rad(90), 0), scale=(1, 0.3, 1), bevel=0.02)
    box("back", (0.06, 0, 0.45), (0.22, 0.16, 0.26), M, p, outline=0.04)


def knife():
    p = tilted()
    M = toon("m", 0xD5DCE6)
    box("blade", (0, 0, 0.3), (0.3, 0.08, 0.8), M, p, outline=0.045)
    cone("tip", (0, 0, 0.82), 0.2, 0.0, 0.36, M, p, outline=0.045, scale=(1, 0.3, 1), seg=4, rot=(0, 0, rad(45)), bevel=0)
    cone("grip", (0, 0, -0.42), 0.11, 0.13, 0.6, wood_mat(), p, outline=0.045)


def sword(t):
    p = tilted()
    M = toon("m", METAL[t], dark=0.65)
    D = toon("d", DARK[t])
    box("blade", (0, 0, 0.3), (0.27, 0.09, 1.0), M, p, outline=0.045, bevel=0.03)
    box("fuller", (0, -0.05, 0.28), (0.06, 0.03, 0.8), D, p, outline=0, bevel=0.01)
    cone("tip", (0, 0, 0.92), 0.185, 0.0, 0.28, M, p, outline=0.045, scale=(1, 0.36, 1), seg=4, rot=(0, 0, rad(45)), bevel=0)
    box("guard", (0, 0, -0.24), (0.72, 0.18, 0.14), D, p, outline=0.045)
    cone("grip", (0, 0, -0.52), 0.085, 0.085, 0.42, toon("grip", 0x5A3B22), p, outline=0.04)
    ball("pommel", (0, 0, -0.78), 0.13, toon("gold", 0xF2B82E, dark=0.7), p, outline=0.04)


def axe(t):
    p = tilted()
    M = toon("m", METAL[t], dark=0.65)
    cone("shaft", (0, 0, -0.08), 0.085, 0.075, 1.7, wood_mat(), p, outline=0.045)
    for s in (-1, 1):
        cone("edge", (0.34 * s, 0, 0.46), 0.5, 0.14, 0.54, M, p, outline=0.045, rot=(0, rad(-90 * s), 0), scale=(1, 0.26, 1), bevel=0.02)
    ball("cap", (0, 0, 0.8), 0.12, toon("d", DARK[t]), p, outline=0.04)


def helm(t):
    M = toon("m", METAL[t], dark=0.65)
    D = toon("d", DARK[t])
    ball("dome", (0, 0, 0.05), (0.72, 0.7, 0.66), M, outline=0.05)
    ring("rim", (0, 0, -0.1), 0.68, 0.11, D, outline=0.04)
    box("nose", (0, -0.68, -0.3), (0.16, 0.1, 0.46), D, outline=0.035)
    for s in (-1, 1):
        box("cheek", (0.56 * s, -0.24, -0.42), (0.12, 0.42, 0.5), M, outline=0.04, bevel=0.05)
    box("crest", (0, 0.05, 0.66), (0.14, 0.8, 0.2), D, outline=0.04, bevel=0.06)


def armor(t):
    M = toon("m", METAL[t], dark=0.65)
    D = toon("d", DARK[t])
    cone("chest", (0, 0, 0.06), 0.46, 0.66, 0.9, M, outline=0.05, scale=(1, 0.62, 1))
    cone("waist", (0, 0, -0.52), 0.6, 0.46, 0.3, D, outline=0.05, scale=(1, 0.64, 1))
    box("ridge", (0, -0.36, 0.1), (0.1, 0.14, 0.7), D, outline=0.03)
    ring("collar", (0, 0, 0.52), 0.3, 0.09, D, outline=0.035, scale=(1, 0.7, 1))
    for s in (-1, 1):
        ball("pauldron", (0.68 * s, 0, 0.38), (0.32, 0.3, 0.26), M, outline=0.05)
        ring("edge", (0.68 * s, 0, 0.3), 0.27, 0.05, D, outline=0.02)


def boots(t):
    M = toon("m", METAL[t], dark=0.65)
    D = toon("d", DARK[t])
    for s in (-1, 1):
        x = 0.4 * s
        cone("leg", (x, 0.12, 0.2), 0.26, 0.32, 0.8, M, outline=0.05)
        ring("cuff", (x, 0.12, 0.58), 0.3, 0.07, D, outline=0.03)
        ball("foot", (x, -0.14, -0.28), (0.3, 0.48, 0.24), M, outline=0.05)
        box("sole", (x, -0.12, -0.48), (0.5, 0.86, 0.1), D, outline=0.035)
        cone("knee", (x, -0.2, 0.3), 0.14, 0.02, 0.2, D, outline=0.03, rot=(rad(90), 0, 0), bevel=0)


WOODS = {1: 0xB98350, 2: 0x7FA05A, 3: 0xA9A2B8}
HIDES = {1: 0xA07850, 2: 0x7F8A7A, 3: 0x5B5668}
CLOTHS = {1: 0x7CC46A, 2: 0x6F8FE0, 3: 0xC14A6A}


def bow(t):
    p = tilted(-28)
    M = toon("m", WOODS[t], dark=0.68)
    for i in range(10):
        a, b = rad(-75 + i * 15), rad(-75 + (i + 1) * 15)
        x0, z0, x1, z1 = -0.28 + 0.62 * math.cos(a), 0.86 * math.sin(a), -0.28 + 0.62 * math.cos(b), 0.86 * math.sin(b)
        cone("limb", ((x0 + x1) / 2, 0, (z0 + z1) / 2), 0.075, 0.075, math.hypot(x1 - x0, z1 - z0) + 0.06, M, p, outline=0.04, rot=(0, math.atan2(x1 - x0, z1 - z0), 0), bevel=0)
    cone("string", (-0.12, 0, 0), 0.02, 0.02, 1.66, flat("string", 0xF6ECD2), p, outline=0.012, bevel=0)
    ball("grip", (0.34, 0, 0), (0.1, 0.1, 0.2), toon("grip", 0x5A3B22), p, outline=0.035)


def staff(t):
    p = tilted()
    M = toon("m", WOODS[t], dark=0.68)
    cone("shaft", (0, 0, -0.16), 0.075, 0.085, 1.6, M, p, outline=0.045)
    ring("crook", (0, 0, 0.7), 0.28, 0.075, M, p, outline=0.035, rot=(rad(90), 0, 0))
    ball("orb", (0, 0, 0.7), 0.2, toon("orb", (0x8FD3FF, 0x9AF0B0, 0xE0A8FF)[t - 1], dark=0.78, light=1.2), p, outline=0.035)


def lcap(t):
    M = toon("m", HIDES[t], dark=0.68)
    D = toon("d", tuple(c * 0.6 for c in srgb(HIDES[t])))
    ball("dome", (0, 0, 0.05), (0.7, 0.68, 0.52), M, outline=0.05)
    cone("brim", (0, -0.06, -0.2), 0.86, 0.72, 0.1, D, outline=0.04)
    for i in range(5):
        box("stitch", (-0.4 + 0.2 * i, -0.66 + abs(i - 2) * 0.08, 0.08), (0.04, 0.03, 0.16), toon("thread", 0xF2E0B8), outline=0, bevel=0)
    cone("feather", (0.5, -0.1, 0.46), 0.14, 0.0, 0.7, toon("feather", 0xD9484F), outline=0.035, rot=(0, rad(24), 0), scale=(1, 0.3, 1), bevel=0)


def lcoat(t):
    M = toon("m", HIDES[t], dark=0.68)
    D = toon("d", tuple(c * 0.6 for c in srgb(HIDES[t])))
    cone("body", (0, 0, 0.1), 0.62, 0.5, 0.9, M, outline=0.05, scale=(1, 0.6, 1))
    cone("skirt", (0, 0, -0.5), 0.78, 0.6, 0.4, M, outline=0.05, scale=(1, 0.6, 1))
    box("belt", (0, -0.02, -0.28), (1.18, 0.78, 0.14), D, outline=0.035)
    box("buckle", (0, -0.42, -0.28), (0.2, 0.06, 0.18), toon("gold", 0xF2B82E, dark=0.7), outline=0.03)
    for s in (-1, 1):
        cone("sleeve", (0.64 * s, 0, 0.2), 0.17, 0.22, 0.6, M, outline=0.045, rot=(0, rad(-24 * s), 0))
    for z in (0.34, 0.14, -0.06):
        box("lace", (0, -0.36, z), (0.26, 0.04, 0.05), toon("thread", 0xF2E0B8), outline=0, rot=(0, rad(14), 0), bevel=0)


def lboots(t):
    M = toon("m", HIDES[t], dark=0.68)
    D = toon("d", tuple(c * 0.6 for c in srgb(HIDES[t])))
    for s in (-1, 1):
        x = 0.4 * s
        cone("leg", (x, 0.12, 0.12), 0.24, 0.3, 0.7, M, outline=0.05)
        cone("fold", (x, 0.12, 0.5), 0.36, 0.3, 0.22, D, outline=0.04)
        ball("foot", (x, -0.14, -0.3), (0.28, 0.46, 0.22), M, outline=0.05)
        box("sole", (x, -0.12, -0.48), (0.48, 0.82, 0.08), D, outline=0.03)


def hat(t):
    M = toon("m", CLOTHS[t], dark=0.68)
    G = toon("gold", 0xF2B82E, dark=0.7)
    cone("brim", (0, 0, -0.42), 0.95, 0.85, 0.1, M, outline=0.045)
    cone("cone", (0, 0, 0.02), 0.6, 0.26, 0.8, M, outline=0.05)
    cone("tip", (0.16, 0, 0.62), 0.27, 0.0, 0.62, M, outline=0.045, rot=(0, rad(30), 0), bevel=0)
    ring("band", (0, 0, -0.28), 0.57, 0.08, G, outline=0.03)
    ball("star", (0, -0.6, -0.2), 0.12, G, outline=0.03)


def robe(t):
    M = toon("m", CLOTHS[t], dark=0.68)
    G = toon("gold", 0xF2B82E, dark=0.7)
    cone("body", (0, 0, 0.0), 0.8, 0.36, 1.5, M, outline=0.05, scale=(1, 0.6, 1))
    ring("collar", (0, 0, 0.72), 0.3, 0.09, G, outline=0.03, scale=(1, 0.7, 1))
    box("front", (0, -0.38, -0.08), (0.12, 0.1, 1.2), G, outline=0.025, rot=(rad(-16), 0, 0), bevel=0.02)
    ring("hem", (0, 0, -0.72), 0.78, 0.06, G, outline=0.025, scale=(1, 0.6, 1))
    for s in (-1, 1):
        cone("sleeve", (0.58 * s, 0, 0.26), 0.26, 0.14, 0.66, M, outline=0.045, rot=(0, rad(-32 * s), 0))


def shoes(t):
    M = toon("m", CLOTHS[t], dark=0.68)
    G = toon("gold", 0xF2B82E, dark=0.7)
    for s in (-1, 1):
        x = 0.42 * s
        ball("foot", (x, -0.02, -0.22), (0.3, 0.56, 0.28), M, outline=0.05)
        ring("cuff", (x, 0.18, 0.06), 0.24, 0.07, G, outline=0.03)
        cone("toe", (x, -0.6, -0.1), 0.12, 0.0, 0.34, M, outline=0.04, rot=(rad(50), 0, 0), bevel=0)
        ball("bell", (x, -0.72, 0.06), 0.07, G, outline=0.025)


def herb():
    S = toon("stem", 0x4E9A50, dark=0.75)
    L = toon("leaf", 0x7CCB6A, dark=0.72)
    for a in (-34, 0, 34):
        p = pivot("p", (0, 0, -0.6))
        p.rotation_euler.y = rad(a)
        cone("stem", (0, 0, 0.55), 0.04, 0.03, 1.1, S, p, outline=0.03, bevel=0)
        for z in (0.5, 0.85, 1.2):
            for s in (-1, 1):
                ball("leaf", (0.15 * s, 0, z), (0.19, 0.06, 0.1), L, p, outline=0.03, rot=(0, rad(-30 * s), 0))
    ring("tie", (0, 0, -0.42), 0.12, 0.05, toon("rope", 0xD9B77E), outline=0.025)


def mushrooms():
    for x, z, s, c in ((-0.02, -0.05, 1.0, 0x8FD3FF), (-0.5, -0.36, 0.62, 0x9AF0B0), (0.5, -0.32, 0.68, 0xC39BFF)):
        cone("stem", (x, 0, z - 0.1), 0.15 * s, 0.12 * s, 0.7 * s, toon("st", 0xF2E6CC, dark=0.78), outline=0.04)
        ball("cap", (x, 0, z + 0.3 * s), (0.46 * s, 0.46 * s, 0.32 * s), toon(f"cap{c}", c, dark=0.75, light=1.2), outline=0.045)
        for k in (-1, 1):
            ball("spot", (x + 0.17 * k * s, -0.36 * s, z + 0.4 * s), 0.07 * s, flat("spot", 0xFFFFFF), outline=0)


def sickle():
    p = tilted()
    M = toon("m", 0xB8C0C8)
    cone("grip", (0, 0, -0.5), 0.1, 0.11, 0.6, wood_mat(), p, outline=0.045)
    for i in range(9):
        a = rad(-70 + i * 26)
        cone("blade", (0.02 - 0.42 * math.cos(a) + 0.4, 0, 0.32 + 0.45 * math.sin(a)), 0.13 - 0.011 * i, 0.12 - 0.011 * i, 0.26, M, p, outline=0.035, rot=(0, -a, 0), scale=(1, 0.4, 1), bevel=0)


ICONS = {
    "ore_1": lambda: ore(0x9A948C, 0xE8894A),
    "ore_2": lambda: ore(0x868C96, 0xCFE0F2),
    "ore_3": lambda: ore(0x6F6878, 0xC39BFF),
    "wood_1": lambda: log(0x84532D, 0xE8C090),
    "wood_3": lambda: log(0x6A6474, 0xC9C3D2),
    "hide_1": hide,
    "crystal_1": crystal,
    "wood_2": lambda: log(0x5F7A48, 0xD8C890),
    "hide_2": lambda: hide(0x7F8A7A),
    "thread_3": thread,
    "herb_1": herb,
    "herb_2": mushrooms,
    "sickle": sickle,
    "pickaxe": pickaxe,
    "hatchet": hatchet,
    "knife": knife,
}
for tier in (1, 2, 3):
    for kind, fn in (("sword", sword), ("axe", axe), ("helm", helm), ("armor", armor), ("boots", boots)):
        ICONS[f"{kind}_{tier}"] = lambda fn=fn, tier=tier: fn(tier)

for tier in (1, 2, 3):
    for kind, fn in (("bow", bow), ("staff", staff), ("lcap", lcap), ("lcoat", lcoat), ("lboots", lboots), ("hat", hat), ("robe", robe), ("shoes", shoes)):
        ICONS[f"{kind}_{tier}"] = lambda fn=fn, tier=tier: fn(tier)

N = 96
frames = []
for name, build in ICONS.items():
    reset()
    kit._mats.clear()
    stage(N, N, 2.35, 0.0)
    build()
    frames.append(render_array())
cols = 8
while len(frames) % cols:
    frames.append(np.zeros((N, N, 4), dtype=np.float32))
os.makedirs(OUT, exist_ok=True)
save_sheet([frames[i : i + cols] for i in range(0, len(frames), cols)], os.path.join(OUT, "icons.png"))
with open(os.path.join(args[1] if len(args) > 1 else OUT, "icons.json"), "w") as f:
    json.dump({"cols": cols, "rows": len(frames) // cols, "index": {k: i for i, k in enumerate(ICONS)}}, f, indent=1)

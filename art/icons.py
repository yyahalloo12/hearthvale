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


# ---- skill pictures (sk_<skill id>) --------------------------------------------


def burst(x, z, color, n=8, r=0.62, size=0.16, y=0.05):
    """Little pointed rays around a point: impact, light, sparks."""
    B = flat(f"burst{color}", color)
    for i in range(n):
        a = i * 2 * math.pi / n + 0.2
        cone("ray", (x + r * math.cos(a), y, z + r * math.sin(a)), size, 0.0, size * 2.4, B, None, outline=0.02, rot=(0, math.pi / 2 - a, 0), scale=(1, 0.4, 1), seg=4, bevel=0)


def arrow(p, z0=0.0, length=1.6, head=0xD5DCE6, fletch=0xE8484A):
    cone("shaft", (0, 0, z0), 0.045, 0.045, length, wood_mat(), p, outline=0.03)
    cone("head", (0, 0, z0 + length / 2 + 0.14), 0.13, 0.0, 0.3, toon(f"ah{head}", head), p, outline=0.035, seg=4, scale=(1, 0.35, 1), bevel=0)
    for s in (-1, 1):
        box("fl", (0.08 * s, 0, z0 - length / 2 + 0.16), (0.14, 0.02, 0.26), toon(f"fl{fletch}", fletch), p, outline=0.025, rot=(0, rad(-20 * s), 0), bevel=0)


def shield(p, face=0x3F6FC4, rim=0xF2B82E, emblem=0xFFE7A3):
    cone("face", (0, 0, 0), 0.62, 0.62, 0.12, toon(f"sh{face}", face), p, outline=0.05, rot=(rad(90), 0, 0), seg=32)
    ring("rim", (0, -0.07, 0), 0.6, 0.06, toon(f"rim{rim}", rim, dark=0.7), p, outline=0.02, rot=(rad(90), 0, 0))
    ball("boss", (0, -0.1, 0), (0.17, 0.08, 0.17), toon(f"em{emblem}", emblem, dark=0.7), p, outline=0.03)


def sk_heavy_strike():
    p = tilted(-35)
    M = toon("m", 0xC3CCD6, dark=0.65)
    box("blade", (0, 0, 0.25), (0.3, 0.09, 1.1), M, p, outline=0.045, bevel=0.03)
    cone("tip", (0, 0, 0.92), 0.2, 0.0, 0.3, M, p, outline=0.045, scale=(1, 0.36, 1), seg=4, rot=(0, 0, rad(45)), bevel=0)
    box("guard", (0, 0, -0.34), (0.8, 0.18, 0.16), toon("d", 0x6B7482), p, outline=0.045)
    cone("grip", (0, 0, -0.6), 0.09, 0.09, 0.4, toon("grip", 0x5A3B22), p, outline=0.04)
    burst(0.48, 0.5, 0xFFD23A, n=7, r=0.34, size=0.12)


def sk_guard():
    shield(pivot("p", (0, 0, 0)))


def sk_charge():
    p = pivot("p", (0.12, 0, 0))
    p.rotation_euler.y = rad(-12)
    shield(p, face=0xC8453A)
    for i, z in enumerate((-0.4, 0, 0.4)):
        box("speed", (-0.95 + 0.1 * i, 0.1, z), (0.5 - 0.1 * i, 0.03, 0.06), flat("spd", 0xFFFFFF), None, outline=0.015, bevel=0.01)


def sk_taunt():
    p = pivot("p", (0, 0, 0))
    p.rotation_euler.y = rad(-25)
    H = toon("horn", 0xE8D2A0, dark=0.7)
    cone("horn", (0, 0, 0), 0.08, 0.36, 0.9, H, p, outline=0.04, rot=(0, rad(90), 0))
    ring("band", (-0.22, 0, 0), 0.17, 0.04, toon("gold", 0xF2B82E, dark=0.7), p, outline=0.015, rot=(0, rad(90), 0))
    for i in range(3):
        ring("wave", (0.62 + 0.18 * i, 0, 0.1 * i), 0.22 + 0.12 * i, 0.03, flat("wv", 0xFFD23A), None, outline=0.012, rot=(0, rad(90), 0), scale=(1, 1, 0.9))


def sk_double_shot():
    for a, x in ((-28, -0.12), (-52, 0.12)):
        p = pivot("p", (x, 0, 0))
        p.rotation_euler.y = rad(a)
        arrow(p)


def sk_pierce_arrow():
    p = pivot("p", (0, 0, 0))
    p.rotation_euler.y = rad(-70)
    arrow(p, length=1.9, head=0xA9C4F0, fletch=0x4AA3FF)
    for x in (-0.25, 0.3):
        ring("hole", (x, 0, 0.02 * x), 0.26, 0.04, flat("pc", 0x9AD0FF), None, outline=0.015, rot=(0, rad(90), 0))


def sk_backstep():
    B = toon("boot", 0x7A5A3A)
    box("leg", (0.2, 0, 0.15), (0.32, 0.3, 0.6), B, None, outline=0.045, bevel=0.08)
    box("foot", (0.0, 0, -0.18), (0.62, 0.32, 0.26), B, None, outline=0.045, bevel=0.1)
    A = toon("arr", 0x9AF0B0, dark=0.7)
    for i in range(7):
        a = rad(200 + i * 22)
        ball("trail", (-0.15 + 0.62 * math.cos(a), -0.1, 0.25 + 0.5 * math.sin(a)), 0.07 + 0.01 * i, A, None, outline=0.02, seg=12)
    cone("tip", (-0.7, -0.1, 0.42), 0.17, 0.0, 0.32, A, None, outline=0.03, rot=(0, rad(-60), 0), seg=3, bevel=0)


def sk_mark_weak():
    for r, c in ((0.62, 0xE8484A), (0.44, 0xFFFFFF), (0.26, 0xE8484A)):
        cone("ring", (0, 0.02 * r, 0), r, r, 0.06, toon(f"t{c}{r}", c, dark=0.75), None, outline=0.03, rot=(rad(90), 0, 0), seg=36)
    ball("eye", (0, -0.06, 0), (0.11, 0.05, 0.11), flat("bull", 0x2A1A12), None, outline=0)
    p = pivot("p", (0.25, -0.1, 0.25))
    p.rotation_euler.y = rad(-135)
    arrow(p, z0=-0.45, length=0.9)


def sk_fireball():
    ball("core", (0, 0, -0.05), 0.42, toon("fire", 0xFF8A2A, dark=0.7, light=1.25), None, outline=0.04)
    ball("hot", (-0.08, -0.25, 0.02), (0.2, 0.1, 0.2), flat("hot", 0xFFE27A), None, outline=0)
    F = toon("flame", 0xFFB02E, dark=0.75, light=1.2)
    for i, (x, s) in enumerate(((-0.25, 0.7), (0.0, 1.0), (0.25, 0.75))):
        cone("tongue", (x + 0.15, 0.05, 0.42 + 0.12 * s), 0.18 * s, 0.0, 0.7 * s, F, None, outline=0.035, rot=(0, rad(28), 0), seg=12)


def sk_ice_lance():
    p = pivot("p", (0, 0, 0))
    p.rotation_euler.y = rad(-48)
    I = toon("ice", 0xBDE8FF, dark=0.72, light=1.2)
    cone("lance", (0, 0, 0.15), 0.18, 0.0, 1.7, I, p, outline=0.04, seg=6, bevel=0)
    for z in (-0.35, 0.05):
        for s in (-1, 1):
            cone("shard", (0.18 * s, 0, z), 0.08, 0.0, 0.4, I, p, outline=0.03, rot=(0, rad(35 * s), 0), seg=5, bevel=0)
    burst(0.0, -0.1, 0xE8F8FF, n=6, r=0.62, size=0.08)


def sk_chain_lightning():
    Y = toon("bolt", 0xFFE24A, dark=0.75, light=1.2)
    pts = [(-0.55, 0.7), (0.05, 0.25), (-0.2, 0.15), (0.35, -0.3), (0.1, -0.35), (0.55, -0.8)]
    for (x1, z1), (x2, z2) in zip(pts, pts[1:]):
        L = math.hypot(x2 - x1, z2 - z1)
        a = math.atan2(z2 - z1, x2 - x1)
        box("seg", ((x1 + x2) / 2, 0, (z1 + z2) / 2), (L + 0.08, 0.1, 0.16), Y, None, outline=0.04, rot=(0, -a, 0), bevel=0.02)
    for x, z in ((-0.62, 0.72), (0.58, -0.8)):
        ball("node", (x, -0.02, z), 0.12, toon("node", 0x9AD0FF), None, outline=0.03)


def sk_mana_shield():
    ball("bubble", (0, 0, 0), 0.66, toon("bub", 0x5AB0FF, dark=0.8, light=1.25), None, outline=0.04)
    ball("shine", (-0.25, -0.5, 0.28), (0.16, 0.06, 0.1), flat("sh", 0xFFFFFF), None, outline=0)
    for a in range(4):
        cone("star", (0, -0.62, 0), 0.08, 0.0, 0.5, flat("st", 0xE8F4FF), None, outline=0.02, rot=(0, rad(45 * a), 0), seg=4, scale=(1, 0.3, 1), bevel=0)


def sk_holy_light():
    ball("sun", (0, 0, 0), 0.36, toon("sun", 0xFFE27A, dark=0.75, light=1.25), None, outline=0.04)
    burst(0, 0, 0xFFD23A, n=10, r=0.6, size=0.13)
    for x in (-0.12, 0.12):
        ball("eye", (x, -0.34, 0.06), (0.04, 0.02, 0.06), flat("se", 0x8A5A18), None, outline=0)


def sk_heal():
    G = toon("cross", 0x4FBF4A, dark=0.7, light=1.2)
    box("v", (0, 0, 0), (0.36, 0.2, 1.1), G, None, outline=0.05, bevel=0.08)
    box("h", (0, 0, 0.08), (1.1, 0.2, 0.36), G, None, outline=0.05, bevel=0.08)
    burst(0.55, 0.55, 0xFFFFFF, n=5, r=0.16, size=0.07)


def sk_blessing():
    ring("halo", (0, 0, 0.42), 0.42, 0.07, toon("halo", 0xFFD23A, dark=0.7, light=1.2), None, outline=0.025, rot=(rad(70), 0, 0))
    W = toon("wing", 0xFFFFFF, dark=0.82)
    for s in (-1, 1):
        for i in range(4):
            ball("feather", (s * (0.25 + 0.14 * i), 0.05, -0.15 - 0.08 * i), (0.22 - 0.03 * i, 0.06, 0.1), W, None, outline=0.03, rot=(0, rad(s * (25 + 12 * i)), 0), seg=16)
    ball("orb", (0, -0.05, -0.15), 0.16, toon("orb", 0xFFE7A3, dark=0.75), None, outline=0.03)


def sk_revive():
    F = toon("feather", 0xF6F1FF, dark=0.8)
    p = pivot("p", (0, 0, 0))
    p.rotation_euler.y = rad(-35)
    cone("quill", (0, 0, -0.1), 0.03, 0.02, 1.4, toon("quill", 0xD8C890), p, outline=0.02)
    for i in range(7):
        z = -0.35 + i * 0.13
        w = 0.26 * math.sin((i + 1) / 8 * math.pi)
        for s in (-1, 1):
            box("vane", (s * w / 2, 0, z), (w, 0.04, 0.14), F, p, outline=0.02, rot=(0, rad(-25 * s), 0), bevel=0.02)
    burst(0.45, 0.5, 0x9AF0B0, n=6, r=0.18, size=0.08)


for _id in ("heavy_strike", "guard", "charge", "taunt", "double_shot", "pierce_arrow", "backstep", "mark_weak",
            "fireball", "ice_lance", "chain_lightning", "mana_shield", "holy_light", "heal", "blessing", "revive"):
    ICONS[f"sk_{_id}"] = globals()[f"sk_{_id}"]


# ---- second job skills ------------------------------------------------------


def sk_fortress():
    p = pivot("p", (0, 0, 0.05))
    shield(p, face=0x8A94A6, rim=0xF2B82E)
    S = toon("stone", 0xA8A198)
    for x in (-0.48, -0.16, 0.16, 0.48):
        box("crenel", (x, 0.05, 0.72), (0.2, 0.2, 0.22), S, None, outline=0.03, bevel=0.02)


def sk_chain_pull():
    I = toon("iron", 0x9AA4B2, dark=0.65)
    for i in range(6):
        ring("link", (-0.62 + 0.24 * i, 0, 0.45 - 0.18 * i), 0.13, 0.04, I, None, outline=0.015, rot=(0, 0, rad(90 * (i % 2))), scale=(1.3, 1, 1))
    cone("hook", (0.62, 0, -0.62), 0.16, 0.0, 0.36, I, None, outline=0.03, rot=(0, rad(-140), 0), seg=4, bevel=0)


def sk_stand_firm():
    cone("pole", (0, 0, -0.05), 0.04, 0.04, 1.6, wood_mat(), None, outline=0.03)
    R = toon("flag", 0xC8453A, dark=0.7)
    box("flag", (0.3, 0, 0.45), (0.6, 0.04, 0.46), R, None, outline=0.04, bevel=0.02)
    ball("emb", (0.3, -0.04, 0.45), (0.1, 0.02, 0.1), toon("gold", 0xF2B82E, dark=0.7), None, outline=0.02)
    box("base", (0, 0, -0.82), (0.5, 0.3, 0.12), toon("stone", 0xA8A198), None, outline=0.03)


def sk_whirlwind():
    W = toon("wind", 0xDDEBFF, dark=0.8)
    for i in range(4):
        ring("swirl", (0.05 * i, 0, -0.5 + 0.3 * i), 0.62 - 0.12 * i, 0.05, W, None, outline=0.015, scale=(1, 1, 0.35))
    p = tilted(-60)
    box("blade", (0.0, 0, 0.55), (0.5, 0.08, 0.36), toon("m", 0xC3CCD6), p, outline=0.04, bevel=0.03)


def sk_bloodboil():
    B = toon("blood", 0xD0283A, dark=0.65, light=1.25)
    ball("drop", (0, 0, -0.15), 0.42, B, None, outline=0.045)
    cone("tip", (0, 0, 0.38), 0.32, 0.0, 0.55, B, None, outline=0.045, seg=24)
    for x, z in ((-0.5, 0.45), (0.5, 0.35), (0.35, 0.7)):
        ball("bubble", (x, -0.05, z), 0.08, B, None, outline=0.02, seg=12)


def sk_ground_slam():
    R = toon("rock", 0x8A7A62, dark=0.62)
    for i in range(6):
        a = i * math.pi / 3
        box("chunk", (0.55 * math.cos(a), 0, -0.45 + 0.25 * abs(math.sin(a))), (0.26, 0.2, 0.2), R, None, outline=0.035, rot=(rad(20 * i), rad(30 * i), 0), bevel=0.04)
    p = pivot("p", (0, 0, 0.15))
    cone("haft", (0, 0, 0.3), 0.06, 0.06, 0.9, wood_mat(), p, outline=0.035)
    box("head", (0, 0, -0.2), (0.6, 0.3, 0.3), toon("m", 0x8A94A6), p, outline=0.04, bevel=0.05)


def sk_long_shot():
    p = pivot("p", (0, 0, 0))
    p.rotation_euler.y = rad(-85)
    arrow(p, length=2.0, head=0xF2B82E, fletch=0xF2B82E)
    for i in range(3):
        box("trail", (-0.75 + 0.15 * i, 0.05, 0.12 - 0.12 * i), (0.4, 0.02, 0.03), flat("tr", 0xFFFFFF), None, outline=0.01)


def sk_steady_aim():
    E = toon("eye", 0xFFFFFF, dark=0.85)
    ball("eye", (0, 0, 0), (0.62, 0.15, 0.36), E, None, outline=0.045)
    ball("iris", (0, -0.12, 0), (0.24, 0.06, 0.24), toon("iris", 0x4AA3FF), None, outline=0.02)
    ball("pupil", (0, -0.17, 0), (0.1, 0.03, 0.1), flat("pu", 0x1A1A22), None, outline=0)
    for a in (0, 90, 180, 270):
        box("cross", (0.75 * math.cos(rad(a)), -0.05, 0.75 * math.sin(rad(a))), (0.22 if a % 180 == 0 else 0.05, 0.03, 0.05 if a % 180 == 0 else 0.22), flat("cr", 0xE8484A), None, outline=0.01)


def sk_arrow_rain():
    C = toon("cloud", 0xB8C4D6, dark=0.8)
    for x, z, s in ((-0.3, 0.55, 0.3), (0.05, 0.62, 0.36), (0.38, 0.55, 0.28)):
        ball("cloud", (x, 0.1, z), s, C, None, outline=0.03)
    for x in (-0.45, -0.15, 0.15, 0.45):
        p = pivot("p", (x, 0, -0.2 - 0.1 * abs(x)))
        p.rotation_euler.y = rad(180)
        arrow(p, length=0.7)


def sk_spike_trap():
    M = toon("m", 0xB8C0C8)
    box("plate", (0, 0.1, -0.45), (1.3, 0.5, 0.12), toon("plate", 0x6B4A2A), None, outline=0.035)
    for i in range(5):
        cone("spike", (-0.5 + 0.25 * i, 0, -0.15 + 0.1 * (i % 2)), 0.1, 0.0, 0.5 + 0.12 * (i % 2), M, None, outline=0.03, seg=4, bevel=0)


def sk_smoke_trap():
    S = toon("smoke", 0xB4B0C0, dark=0.8)
    rnd = random.Random(5)
    for i in range(7):
        ball("puff", (rnd.uniform(-0.55, 0.55), 0, rnd.uniform(-0.35, 0.55)), rnd.uniform(0.22, 0.34), S, None, outline=0.03)
    ball("bomb", (0, -0.2, -0.45), 0.2, toon("bomb", 0x3A3A44), None, outline=0.03)


def sk_camouflage():
    L = toon("leaf", 0x4F9E4A, dark=0.65)
    for i in range(7):
        a = i * 2 * math.pi / 7
        ball("leaf", (0.42 * math.cos(a), 0, 0.42 * math.sin(a)), (0.26, 0.06, 0.14), L, None, outline=0.03, rot=(0, -a, 0))
    for x in (-0.12, 0.12):
        ball("eye", (x, -0.1, 0.05), (0.07, 0.03, 0.05), flat("ey", 0xFFF39A), None, outline=0)


def sk_meteor():
    ball("rock", (0.25, 0, -0.25), 0.34, toon("met", 0x7A5A4A, dark=0.6), None, outline=0.045)
    F = toon("flame", 0xFF8A2A, dark=0.75, light=1.25)
    for i, s in enumerate((0.3, 0.22, 0.16)):
        cone("tail", (-0.1 - 0.25 * i, 0.03, 0.12 + 0.25 * i), s, 0.0, 0.7, F, None, outline=0.03, rot=(0, rad(-135), 0), seg=12)


def sk_blizzard():
    I = toon("ice", 0xBDE8FF, dark=0.72, light=1.2)
    for x, z in ((-0.4, 0.3), (0.35, 0.4), (0, -0.2), (-0.35, -0.45), (0.4, -0.35)):
        for a in (0, 60, 120):
            box("flake", (x, 0, z), (0.36, 0.04, 0.06), I, None, outline=0.02, rot=(0, rad(a), 0), bevel=0)


def sk_tri_weave():
    for i, c in enumerate((0xFF8A2A, 0x8FD3FF, 0xFFE24A)):
        a = i * 2 * math.pi / 3 + 0.5
        ball("orb", (0.42 * math.cos(a), 0, 0.42 * math.sin(a)), 0.22, toon(f"o{c}", c, dark=0.72, light=1.25), None, outline=0.035)
    ring("weave", (0, 0.02, 0), 0.42, 0.04, toon("thr", 0xC39BFF), None, outline=0.015, rot=(rad(90), 0, 0))


def sk_curse_weakness():
    S = toon("skull", 0xE8E2D2, dark=0.75)
    ball("skull", (0, 0, 0.1), (0.42, 0.36, 0.4), S, None, outline=0.045)
    box("jaw", (0, 0, -0.32), (0.4, 0.3, 0.18), S, None, outline=0.04, bevel=0.06)
    for x in (-0.15, 0.15):
        ball("eye", (x, -0.3, 0.08), (0.11, 0.05, 0.12), flat("ey", 0x8A3AC0), None, outline=0)


def sk_poison_mist():
    G = toon("pois", 0x7ACF4A, dark=0.7)
    rnd = random.Random(9)
    for i in range(6):
        ball("puff", (rnd.uniform(-0.5, 0.5), 0, rnd.uniform(-0.4, 0.5)), rnd.uniform(0.2, 0.32), G, None, outline=0.03)
    for x, z in ((-0.2, 0.0), (0.25, 0.15)):
        ball("bub", (x, -0.3, z), 0.07, flat("bb", 0xD8FF9A), None, outline=0)


def sk_soul_drain():
    S = toon("soul", 0xB8E0FF, dark=0.8, light=1.25)
    ball("soul", (-0.25, 0, 0.25), (0.26, 0.15, 0.3), S, None, outline=0.035)
    cone("wisp", (-0.05, 0.02, -0.05), 0.16, 0.0, 0.7, S, None, outline=0.03, rot=(0, rad(135), 0), seg=12)
    ball("hand", (0.4, 0, -0.42), (0.22, 0.12, 0.18), toon("hand", 0x8A5AC0), None, outline=0.035)


def sk_mass_heal():
    G = toon("cross", 0x4FBF4A, dark=0.7, light=1.2)
    for x, z, s in ((0, 0.12, 1.0), (-0.48, -0.3, 0.6), (0.48, -0.3, 0.6)):
        box("v", (x, 0, z), (0.22 * s, 0.14, 0.7 * s), G, None, outline=0.04, bevel=0.05)
        box("h", (x, 0, z + 0.05 * s), (0.7 * s, 0.14, 0.22 * s), G, None, outline=0.04, bevel=0.05)


def sk_barrier():
    ball("dome", (0, 0, -0.2), (0.75, 0.4, 0.6), toon("dome", 0xFFE7A3, dark=0.85, light=1.2), None, outline=0.04)
    ball("shine", (-0.3, -0.36, 0.08), (0.12, 0.04, 0.08), flat("sh", 0xFFFFFF), None, outline=0)
    box("ground", (0, 0, -0.55), (1.5, 0.4, 0.08), toon("gr", 0x8A6A4A), None, outline=0.03)


def sk_foresight():
    ball("orb", (0, 0, 0.1), 0.48, toon("orb", 0xC39BFF, dark=0.75, light=1.25), None, outline=0.045)
    ball("inner", (0, -0.35, 0.1), (0.18, 0.06, 0.12), flat("eye", 0xFFFFFF), None, outline=0)
    cone("stand", (0, 0, -0.5), 0.36, 0.2, 0.25, toon("gold", 0xF2B82E, dark=0.7), None, outline=0.035)


def sk_light_hammer():
    p = tilted(-30)
    cone("haft", (0, 0, -0.25), 0.07, 0.07, 1.1, wood_mat(), p, outline=0.035)
    box("head", (0, 0, 0.45), (0.7, 0.36, 0.38), toon("gold", 0xF2B82E, dark=0.7, light=1.2), p, outline=0.045, bevel=0.06)
    burst(0.45, 0.45, 0xFFF39A, n=6, r=0.2, size=0.09)


def sk_justice_aura():
    G = toon("gold", 0xF2B82E, dark=0.7, light=1.2)
    cone("pillar", (0, 0, -0.1), 0.05, 0.05, 1.1, G, None, outline=0.03)
    box("beam", (0, 0, 0.42), (1.2, 0.08, 0.07), G, None, outline=0.03)
    for s in (-1, 1):
        cone("pan", (0.5 * s, 0, -0.1 + 0.1 * s), 0.24, 0.12, 0.1, G, None, outline=0.03)
        box("str", (0.5 * s, 0, 0.18 + 0.05 * s), (0.02, 0.02, 0.5), G, None, outline=0)


def sk_judgment():
    S = toon("sword", 0xFFF2B8, dark=0.75, light=1.25)
    p = pivot("p", (0, 0, 0))
    p.rotation_euler.y = rad(180)
    box("blade", (0, 0, 0.15), (0.26, 0.08, 1.1), S, p, outline=0.045)
    cone("tip", (0, 0, 0.82), 0.18, 0.0, 0.28, S, p, outline=0.045, scale=(1, 0.36, 1), seg=4, rot=(0, 0, rad(45)), bevel=0)
    box("guard", (0, 0, -0.45), (0.7, 0.16, 0.14), toon("gold", 0xF2B82E, dark=0.7), p, outline=0.04)
    burst(0, 0.7, 0xFFE24A, n=8, r=0.3, size=0.1)


for _id in ("fortress", "chain_pull", "stand_firm", "whirlwind", "bloodboil", "ground_slam", "long_shot", "steady_aim", "arrow_rain",
            "spike_trap", "smoke_trap", "camouflage", "meteor", "blizzard", "tri_weave", "curse_weakness", "poison_mist", "soul_drain",
            "mass_heal", "barrier", "foresight", "light_hammer", "justice_aura", "judgment"):
    ICONS[f"sk_{_id}"] = globals()[f"sk_{_id}"]


# ---- accessories and off-hands (tiers 1-3), legendary uniques ---------------------
METAL_T = {1: 0xD88A4E, 2: 0xC3CCD6, 3: 0xA9C4F0}
LEATHER_T = {1: 0x9A6A3E, 2: 0x6E7A5A, 3: 0x5A5068}
GEM_T = {1: 0xE84A4A, 2: 0x4AA3FF, 3: 0xC39BFF}
GOLD = 0xF2B82E


def g_shield(t, face=None, rim=None):
    p = pivot("p", (0, 0, 0))
    p.rotation_euler.y = rad(-8)
    cone("face", (0, 0, 0), 0.66, 0.66, 0.12, toon(f"sf{t}{face}", face or (0x8A5A32 if t == 1 else METAL_T[t]), dark=0.65), p, outline=0.05, rot=(rad(90), 0, 0), seg=32)
    ring("rim", (0, -0.07, 0), 0.64, 0.06, toon(f"sr{t}{rim}", rim or METAL_T[max(1, t)], dark=0.65), p, outline=0.02, rot=(rad(90), 0, 0))
    box("bar", (0, -0.09, 0), (1.1, 0.04, 0.16), toon(f"sb{t}", DARK[t]), p, outline=0.03)
    ball("boss", (0, -0.12, 0), (0.18, 0.08, 0.18), toon("goldb", GOLD, dark=0.7), p, outline=0.03)


def g_quiver(t, color=None):
    p = tilted(-25)
    L = toon(f"q{t}{color}", color or LEATHER_T[t], dark=0.65)
    cone("tube", (0, 0, -0.1), 0.26, 0.3, 1.2, L, p, outline=0.05)
    ring("band", (0, 0, 0.3), 0.29, 0.04, toon(f"qb{t}", METAL_T[t]), p, outline=0.015)
    for i, x in enumerate((-0.12, 0.0, 0.12)):
        cone("shaft", (x, 0, 0.7), 0.025, 0.025, 0.5, wood_mat(), p, outline=0.02)
        box("fl", (x, 0, 0.92), (0.1, 0.02, 0.18), toon("flr", 0xE8484A if i != 1 else 0xFFFFFF), p, outline=0.02, bevel=0)


def g_tome(t, cover=None):
    p = pivot("p", (0, 0, 0))
    p.rotation_euler = (rad(10), rad(-20), 0)
    C = toon(f"tc{t}{cover}", cover or (0x8A3A3A, 0x3A6A5A, 0x5A3A8A)[t - 1], dark=0.65)
    box("cover", (0, 0, 0), (0.9, 0.3, 1.1), C, p, outline=0.05, bevel=0.04)
    box("pages", (0.04, -0.01, 0), (0.82, 0.24, 1.02), toon("pg", 0xF6EED8, dark=0.85), p, outline=0.02, bevel=0.01)
    box("front", (0, -0.16, 0), (0.9, 0.02, 1.1), C, p, outline=0.03, bevel=0.01)
    ball("gem", (0, -0.19, 0.05), (0.14, 0.05, 0.14), toon(f"tg{t}", GEM_T[t], dark=0.7, light=1.25), p, outline=0.025)
    for z in (-0.4, 0.4):
        box("corner", (0.36, -0.18, z), (0.16, 0.03, 0.16), toon("goldc", GOLD, dark=0.7), p, outline=0.02)


def g_gloves(t, color=None):
    L = toon(f"gl{t}{color}", color or LEATHER_T[t], dark=0.65)
    for x, a in ((-0.3, 12), (0.3, -12)):
        p = pivot("p", (x, 0, 0))
        p.rotation_euler.y = rad(a)
        box("palm", (0, 0, 0), (0.42, 0.22, 0.5), L, p, outline=0.04, bevel=0.1)
        for i in range(4):
            cone("finger", (-0.15 + 0.1 * i, 0, 0.38), 0.05, 0.045, 0.28, L, p, outline=0.025)
        cone("thumb", (0.24 if x < 0 else -0.24, 0, 0.12), 0.055, 0.05, 0.26, L, p, outline=0.025, rot=(0, rad(-50 if x < 0 else 50), 0))
        box("cuff", (0, 0, -0.32), (0.48, 0.26, 0.18), toon(f"cuff{t}", METAL_T[t]), p, outline=0.03, bevel=0.05)


def g_amulet(t, gem=None):
    ring("chain", (0, 0, 0.25), 0.5, 0.035, toon("goldch", GOLD, dark=0.7), None, outline=0.015, rot=(rad(90), 0, 0), scale=(1, 1, 0.75))
    cone("set", (0, -0.02, -0.35), 0.24, 0.24, 0.1, toon(f"set{t}", METAL_T[t], dark=0.65), None, outline=0.03, rot=(rad(90), 0, 0), seg=6)
    ball("gem", (0, -0.08, -0.35), (0.17, 0.08, 0.2), toon(f"ag{t}{gem}", gem or GEM_T[t], dark=0.7, light=1.25), None, outline=0.03)


def g_ring(t, gem=None, band=None):
    ring("band", (0, 0, -0.1), 0.42, 0.09, toon(f"rb{t}{band}", band or (0xD88A4E, 0xC3CCD6, GOLD)[t - 1], dark=0.65), None, outline=0.03, rot=(rad(75), 0, 0))
    cone("crown", (0, -0.02, 0.35), 0.16, 0.22, 0.14, toon(f"rc{t}", METAL_T[t]), None, outline=0.03, seg=8)
    ball("gem", (0, -0.02, 0.5), (0.2, 0.2, 0.17), toon(f"rg{t}{gem}", gem or GEM_T[t], dark=0.7, light=1.25), None, outline=0.03)


def g_belt(t, color=None):
    L = toon(f"bl{t}{color}", color or LEATHER_T[t], dark=0.65)
    ring("strap", (0, 0, 0), 0.62, 0.09, L, None, outline=0.035, rot=(rad(70), 0, 0), scale=(1, 1, 0.35))
    box("buckle", (0, -0.24, -0.1), (0.36, 0.06, 0.3), toon(f"bk{t}", METAL_T[t], dark=0.65), None, outline=0.04, bevel=0.03)
    box("hole", (0, -0.28, -0.1), (0.2, 0.04, 0.16), toon("bkin", 0x3A2414), None, outline=0, bevel=0.01)
    for x in (-0.45, 0.45):
        box("pouch", (x, -0.1, -0.25), (0.22, 0.16, 0.24), L, None, outline=0.03, bevel=0.05)


def g_cloak(t, color=None):
    C = toon(f"ck{t}{color}", color or (0x6A8A4A, 0x3A6A8A, 0x6A4A8A)[t - 1], dark=0.65)
    cone("cape", (0, 0, -0.1), 0.62, 0.22, 1.2, C, None, outline=0.05, scale=(1, 0.35, 1), seg=24)
    ball("hood", (0, 0.05, 0.55), (0.3, 0.22, 0.26), C, None, outline=0.04)
    ball("clasp", (0, -0.12, 0.38), 0.09, toon("goldcl", GOLD, dark=0.7), None, outline=0.025)
    for x in (-0.3, 0.0, 0.3):
        box("fold", (x, -0.2, -0.3), (0.03, 0.02, 0.6), toon("fold", 0x000000), None, outline=0, bevel=0)


def glow(color=0xFFB02E):
    """The golden shine behind a legendary item."""
    for i, s in enumerate((0.95, 0.75)):
        ball("aura", (0, 0.5 + 0.1 * i, 0), (s, 0.05, s), flat(f"aura{i}{color}", color if i else 0xFFE7A3), None, outline=0)


GEAR = {"shield": g_shield, "quiver": g_quiver, "tome": g_tome, "gloves": g_gloves, "amulet": g_amulet, "ring": g_ring, "belt": g_belt, "cloak": g_cloak}
for tier in (1, 2, 3):
    for kind, fn in GEAR.items():
        ICONS[f"{kind}_{tier}"] = lambda fn=fn, tier=tier: fn(tier)

UNIQUE_ICONS = {
    "u_bow_thousand": lambda: (glow(), bow(3), burst(0.5, 0.55, 0xFFE24A, n=5, r=0.2, size=0.08)),
    "u_staff_wildfire": lambda: (glow(0xFF6A2A), staff(3), sk_fireball() if False else burst(0.45, 0.6, 0xFF8A2A, n=7, r=0.24, size=0.1)),
    "u_axe_reaper": lambda: (glow(0x9A5AFF), axe(3)),
    "u_shield_bastion": lambda: (glow(), g_shield(3, face=0x8A94A6, rim=GOLD)),
    "u_quiver_rain": lambda: (glow(0x4AA3FF), g_quiver(3, color=0x2A4A8A)),
    "u_tome_eternity": lambda: (glow(0xC39BFF), g_tome(3, cover=0x2A1A4A)),
    "u_ring_storm": lambda: (glow(0x4AA3FF), g_ring(3, gem=0xFFE24A, band=0x8FD3FF)),
    "u_ring_blood": lambda: (glow(0xE84A4A), g_ring(3, gem=0xD0283A, band=0x3A1A1A)),
    "u_amulet_dawn": lambda: (glow(), g_amulet(3, gem=0xFFE7A3)),
    "u_cloak_shadow": lambda: (glow(0x6A4A8A), g_cloak(3, color=0x2A2238)),
    "u_gloves_twin": lambda: (glow(), g_gloves(3, color=0xC8453A)),
    "u_belt_titan": lambda: (glow(), g_belt(3, color=0x8A5A1A)),
}
ICONS.update(UNIQUE_ICONS)

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

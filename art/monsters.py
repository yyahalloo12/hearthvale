"""All monsters, one sprite sheet each (8 facings x 7 frames).

blender --background --factory-startup --python art/monsters.py -- <out dir> [preview]
Frames: idle, walk 1-4, attack 1-2. Facing 0 looks at the camera, then clockwise.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import kit  # noqa: E402
from kit import *  # noqa: E402,F403

args = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(args[0])
PREVIEW = "preview" in args
rad = math.radians


class Rig:
    """Moving parts of one monster: named pivots and a pose function."""

    def __init__(self):
        self.turn = pivot("turn", (0, 0, 0))
        self.body = pivot("body", (0, 0, 0), self.turn)
        self.parts = {}

    def part(self, name, loc, parent=None):
        p = pivot(name, loc, parent or self.body)
        self.parts[name] = p
        return p

    def rest(self):
        self.body.location = (0, 0, 0)
        self.body.rotation_euler = (0, 0, 0)
        for p in self.parts.values():
            p.rotation_euler = (0, 0, 0)


def eyes(parent, x, y, z, size, mat=None, shine=True):
    mat = mat or flat("eye", 0x2B1A10)
    for s in (-1, 1):
        ball("eye", (x * s, y, z), (size * 0.75, size * 0.5, size), mat, parent, outline=0)
        if shine:
            ball("shine", (x * s - size * 0.2, y - size * 0.42, z + size * 0.35), size * 0.3, flat("shine", 0xFFFFFF), parent, outline=0)


# ---- hen and the angry hen boss ------------------------------------------------
def hen(feather=0xFFF6E6, comb=0xFF6A1A, boss=False):
    r = Rig()
    F = toon(f"feather{boss}", feather, dark=0.78)
    W = toon(f"wing{boss}", 0xE8D9BE if not boss else 0xE8B98A)
    C = toon(f"comb{boss}", comb)
    Y = toon("beak", 0xF5B02E)
    ball("belly", (0, 0.03, 0.42), (0.36, 0.42, 0.33), F, r.body)
    ball("chestfluff", (0, -0.2, 0.46), (0.27, 0.24, 0.25), F, r.body)
    for i, a in enumerate((-32, 0, 32)):
        cone("tail", (0.13 * (i - 1), 0.44, 0.62), 0.11, 0.03, 0.34, W if i != 1 else F, r.body, rot=(rad(-38), rad(a * 0.5), 0))
    for s in (-1, 1):
        w = r.part(f"wing{s}", (0.31 * s, -0.02, 0.52))
        ball("wing", (0.03 * s, 0.07, -0.08), (0.09, 0.26, 0.17), W, w)
        leg = r.part(f"leg{s}", (0.14 * s, 0, 0.22))
        cone("shin", (0, 0, -0.1), 0.035, 0.035, 0.2, Y, leg, outline=0.018, bevel=0)
        for a in (-28, 0, 28):
            cone("toe", (0.05 * math.sin(rad(a)), -0.07, -0.2), 0.03, 0.02, 0.14, Y, leg, outline=0.015, rot=(rad(90), 0, rad(a)), bevel=0)
    head = r.part("head", (0, -0.24, 0.66))
    ball("neck", (0, 0.02, 0.04), (0.19, 0.18, 0.22), F, head)
    ball("head", (0, -0.03, 0.2), (0.235, 0.23, 0.22), F, head)
    cone("beak", (0, -0.29, 0.17), 0.08, 0.0, 0.17, Y, head, outline=0.02, rot=(rad(98), 0, 0), bevel=0)
    ball("wattle", (0, -0.23, 0.05), (0.05, 0.045, 0.08), C, head, outline=0.02)
    # a comb like little flames
    for y, z, h in ((-0.13, 0.42, 0.17), (-0.01, 0.46, 0.24), (0.12, 0.42, 0.18)):
        cone("flame", (0, y, z), 0.075, 0.0, h, C, head, outline=0.022, bevel=0)
    eyes(head, 0.13, -0.19, 0.24, 0.06)
    if boss:
        G = toon("crown", 0xFFD23A, dark=0.7)
        cone("band", (0, -0.02, 0.4), 0.17, 0.18, 0.1, G, head, outline=0.025)
        for i in range(6):
            a = i * math.pi / 3
            cone("spike", (0.17 * math.cos(a), -0.02 + 0.17 * math.sin(a), 0.5), 0.05, 0.0, 0.16, G, head, outline=0.018, bevel=0)
        for s in (-1, 1):
            box("brow", (0.12 * s, -0.22, 0.33), (0.14, 0.03, 0.035), flat("eye", 0x2B1A10), head, outline=0, rot=(0, rad(-26 * s), 0), bevel=0.01)
        ring("collar", (0, 0, 0.02), 0.2, 0.05, toon("robe", 0xB83246), head, outline=0.025)

    def pose(kind, t):
        s = math.sin(t * 2 * math.pi)
        if kind == "walk":
            r.parts["leg1"].rotation_euler.x = rad(36) * s
            r.parts["leg-1"].rotation_euler.x = -rad(36) * s
            r.parts["head"].rotation_euler.x = rad(8) * s
            r.body.location.z = 0.04 * abs(math.cos(t * 2 * math.pi))
        elif kind == "attack":
            r.body.rotation_euler.x = rad(-12 if t < 0.5 else 24)
            r.parts["head"].rotation_euler.x = rad(-14 if t < 0.5 else 34)
            for q in (-1, 1):
                r.parts[f"wing{q}"].rotation_euler.y = rad(-62 * q if t < 0.5 else -20 * q)

    return r, pose


# ---- fat field rat -----------------------------------------------------------------
def rat():
    r = Rig()
    FUR = toon("fur", 0x94806C)
    PALE = toon("ratbelly", 0xD8C6AE)
    PINK = toon("ratpink", 0xF0A8A8)
    ball("body", (0, 0.1, 0.36), (0.42, 0.46, 0.36), FUR, r.body)
    ball("tummy", (0, -0.1, 0.31), (0.33, 0.34, 0.28), PALE, r.body, outline=0)
    head = r.part("head", (0, -0.36, 0.42))
    ball("head", (0, -0.04, 0.06), (0.26, 0.28, 0.23), FUR, head)
    ball("snout", (0, -0.27, 0.0), (0.13, 0.14, 0.11), PALE, head, outline=0.022)
    ball("nose", (0, -0.41, 0.03), 0.052, PINK, head, outline=0.018)
    for s in (-1, 1):
        ball("ear", (0.21 * s, 0.05, 0.27), (0.15, 0.06, 0.16), FUR, head)
        ball("earin", (0.21 * s, 0.0, 0.27), (0.1, 0.04, 0.11), PINK, head, outline=0)
        box("tooth", (0.028 * s, -0.35, -0.1), (0.045, 0.02, 0.07), toon("tooth", 0xFFFFFF), head, outline=0.012, bevel=0.01)
        for q in (-1, 1):
            foot = r.part(f"foot{s}{q}", (0.25 * s, 0.1 + 0.24 * q, 0.16))
            ball("foot", (0, -0.04, -0.09), (0.09, 0.13, 0.07), PINK, foot, outline=0.02)
    eyes(head, 0.13, -0.25, 0.13, 0.055)
    tail = r.part("tail", (0, 0.52, 0.3))
    for i in range(14):
        k = i * 0.4
        ball("tailseg", (0.06 * math.sin(k), 0.075 * k, 0.01 * k * k), 0.055 - i * 0.0022, PINK, tail, outline=0.016, seg=16)
    # a wisp of wheat stuck on the back
    for a in (-18, 12):
        cone("straw", (0.1 * (1 if a > 0 else -1), 0.16, 0.72), 0.02, 0.05, 0.22, toon("straw", 0xE8C86A), r.body, outline=0.018, rot=(rad(-20), rad(a), 0), bevel=0)

    def pose(kind, t):
        s = math.sin(t * 2 * math.pi)
        if kind == "walk":
            for k in (-1, 1):
                for q in (-1, 1):
                    r.parts[f"foot{k}{q}"].rotation_euler.x = rad(34) * s * k * q
            r.body.location.z = 0.04 * abs(s)
            r.body.rotation_euler.y = rad(5) * s
            r.parts["tail"].rotation_euler.z = rad(16) * s
        elif kind == "attack":
            r.body.rotation_euler.x = rad(-18 if t < 0.5 else 10)
            r.body.location.y = 0.06 if t < 0.5 else -0.16
            r.parts["head"].rotation_euler.x = rad(-12 if t < 0.5 else 18)

    return r, pose


# ---- naughty scarecrow ---------------------------------------------------------------
def scarecrow():
    r = Rig()
    WOOD = toon("pole", 0x7A4A26)
    SACK = toon("sack", 0xF0D9A8)
    SHIRT = toon("shirt", 0x6B8F3A)
    STRAW = toon("straw", 0xE8C86A)
    HAT = toon("hat", 0x6B4226)
    cone("pole", (0, 0, 0.28), 0.055, 0.05, 0.6, WOOD, r.body)
    cone("shirt", (0, 0, 0.68), 0.3, 0.2, 0.46, SHIRT, r.body)
    box("patch", (0.1, -0.25, 0.62), (0.13, 0.03, 0.13), toon("patch", 0xC8453A), r.body, outline=0.015, rot=(rad(-12), 0, rad(10)))
    box("patch2", (-0.12, -0.22, 0.78), (0.1, 0.03, 0.1), toon("patch2", 0x4A90D9), r.body, outline=0.015, rot=(rad(-12), 0, rad(-8)))
    for i in range(10):
        a = i * math.pi / 5
        cone("hem", (0.25 * math.cos(a), 0.25 * math.sin(a), 0.42), 0.06, 0.02, 0.18, STRAW, r.body, outline=0.016, rot=(rad(180) + rad(14) * math.sin(a), rad(14) * math.cos(a), 0), bevel=0)
    for s in (-1, 1):
        arm = r.part(f"arm{s}", (0.16 * s, 0, 0.84))
        cone("sleeve", (0.22 * s, 0, 0), 0.12, 0.09, 0.36, SHIRT, arm, rot=(0, rad(90 * s), 0))
        for a in (-26, 0, 26):
            cone("finger", (0.48 * s, 0, 0.05 * a / 26), 0.028, 0.012, 0.2, STRAW, arm, outline=0.016, rot=(0, rad(90 * s - a * s), 0), bevel=0)
    neck = pivot("neck", (0, 0, 0.94), r.body)
    neck.rotation_euler.x = rad(-14)  # looks up a little, so the face shows under the hat
    head = r.part("head", (0, 0, 0), neck)
    ball("head", (0, 0, 0.22), (0.29, 0.28, 0.28), SACK, head)
    ring("rope", (0, 0, 0.0), 0.15, 0.035, WOOD, head)
    dark = flat("eye", 0x2B1A10)
    for s in (-1, 1):
        box("eyex", (0.11 * s, -0.255, 0.26), (0.1, 0.02, 0.03), dark, head, outline=0, rot=(0, rad(45), rad(22 * s)), bevel=0)
        box("eyex", (0.11 * s, -0.255, 0.26), (0.1, 0.02, 0.03), dark, head, outline=0, rot=(0, rad(-45), rad(22 * s)), bevel=0)
    for i in range(5):
        x = (i - 2) * 0.055
        box("stitch", (x, -0.258 + abs(x) * 0.25, 0.12 + abs(x) * 0.45), (0.045, 0.02, 0.022), dark, head, outline=0, rot=(0, rad(-18 * (i - 2)), 0), bevel=0)
    cone("brim", (0, 0.03, 0.46), 0.42, 0.37, 0.05, HAT, head, rot=(rad(4), rad(-5), 0))
    cone("hat", (0, 0.05, 0.66), 0.25, 0.07, 0.42, HAT, head, rot=(rad(-8), rad(8), 0))
    ring("hatband", (0, 0.03, 0.51), 0.235, 0.035, toon("patch", 0xC8453A), head, outline=0.018)
    for s in (-1, 1):
        cone("hair", (0.25 * s, 0.02, 0.3), 0.05, 0.02, 0.2, STRAW, head, outline=0.016, rot=(rad(180), rad(20 * s), 0), bevel=0)

    def pose(kind, t):
        s = math.sin(t * 2 * math.pi)
        if kind == "walk":  # hops on one leg
            r.body.location.z = 0.14 * abs(s)
            r.body.rotation_euler.y = rad(9) * math.cos(t * 2 * math.pi)
            for k in (-1, 1):
                r.parts[f"arm{k}"].rotation_euler.y = rad(16) * s * k
        elif kind == "attack":
            r.body.rotation_euler.z = rad(34 if t < 0.5 else -46)
            r.body.rotation_euler.x = rad(0 if t < 0.5 else 14)
            for k in (-1, 1):
                r.parts[f"arm{k}"].rotation_euler.y = rad(-30 * k if t < 0.5 else 12 * k)

    return r, pose


# ---- colourless shade -------------------------------------------------------------------
def shadow():
    r = Rig()
    D = toon("shade", 0x46414F, dark=0.6)
    M = toon("shade2", 0x5C5667, dark=0.65)
    GLOW = flat("shadeeye", 0xF1ECFF)
    ball("head", (0, 0, 0.78), (0.3, 0.29, 0.3), D, r.body)
    cone("cloak", (0, 0.02, 0.44), 0.36, 0.2, 0.62, D, r.body)
    for i in range(9):
        a = i * 2 * math.pi / 9
        cone("wisp", (0.3 * math.cos(a), 0.3 * math.sin(a), 0.14), 0.1, 0.0, 0.26 + 0.08 * (i % 2), D, r.body, outline=0.022, rot=(rad(180) + rad(12) * math.sin(a), rad(12) * math.cos(a), 0), bevel=0)
    cone("curl", (0.03, 0.04, 1.13), 0.11, 0.0, 0.26, D, r.body, rot=(rad(-24), rad(18), 0), bevel=0)
    for s in (-1, 1):
        ball("eye", (0.115 * s, -0.265, 0.79), (0.062, 0.04, 0.095), GLOW, r.body, outline=0, rot=(0, rad(-10 * s), rad(18 * s)))
        arm = r.part(f"arm{s}", (0.24 * s, -0.04, 0.58))
        cone("arm", (0.06 * s, -0.05, -0.12), 0.05, 0.1, 0.32, M, arm, rot=(rad(-22), rad(-24 * s), 0))
        ball("claw", (0.13 * s, -0.12, -0.28), (0.07, 0.07, 0.085), M, arm)
    # frayed threads, the colour it lost
    for i, c in enumerate((0xC14A6A, 0x4A90D9, 0xE6C84A)):
        cone("thread", (-0.16 + 0.16 * i, -0.31, 0.4 - 0.05 * (i % 2)), 0.014, 0.014, 0.22, toon(f"thr{i}", c, dark=0.8), r.body, outline=0, rot=(rad(-14), 0, 0), bevel=0)

    def pose(kind, t):
        s = math.sin(t * 2 * math.pi)
        r.body.location.z = 0.06 + 0.05 * s
        if kind == "walk":
            r.body.rotation_euler.x = rad(12)
            r.body.rotation_euler.y = rad(5) * s
            for k in (-1, 1):
                r.parts[f"arm{k}"].rotation_euler.x = rad(-20 + 10 * s * k)
        elif kind == "attack":
            r.body.rotation_euler.x = rad(-14 if t < 0.5 else 24)
            for k in (-1, 1):
                r.parts[f"arm{k}"].rotation_euler.x = rad(-140 if t < 0.5 else -56)

    return r, pose


# ---- pale hunter ---------------------------------------------------------------------------
def hunter():
    r = Rig()
    CLOAK = toon("cloak", 0xC3BDCE, dark=0.66)
    INNER = toon("cloakin", 0x8F889C)
    BONE = toon("bone", 0xEFEAF6, dark=0.75)
    RED = flat("huntereye", 0xFF4A4A)
    cone("cloak", (0, 0.03, 0.5), 0.4, 0.2, 0.94, CLOAK, r.body)
    cone("front", (0, -0.1, 0.42), 0.27, 0.1, 0.8, INNER, r.body, outline=0)
    ring("mantle", (0, 0, 0.93), 0.24, 0.1, CLOAK, r.body, scale=(1.15, 1, 0.8))
    head = r.part("head", (0, 0, 1.0))
    ball("hood", (0, 0.05, 0.2), (0.31, 0.31, 0.32), CLOAK, head)
    cone("hoodtip", (0, 0.24, 0.43), 0.16, 0.0, 0.34, CLOAK, head, rot=(rad(-52), 0, 0), bevel=0)
    ball("mask", (0, -0.17, 0.17), (0.2, 0.14, 0.23), BONE, head, outline=0.025)
    for s in (-1, 1):
        ball("eye", (0.08 * s, -0.295, 0.2), (0.045, 0.025, 0.028), RED, head, outline=0, rot=(0, rad(16 * s), 0))
        cone("horn", (0.21 * s, -0.02, 0.5), 0.06, 0.0, 0.3, BONE, head, outline=0.022, rot=(0, rad(24 * s), 0), bevel=0)
        arm = r.part(f"arm{s}", (0.26 * s, 0, 0.84))
        cone("sleeve", (0.05 * s, -0.06, -0.16), 0.12, 0.08, 0.36, CLOAK, arm, rot=(rad(-18), rad(-16 * s), 0))
        ball("hand", (0.1 * s, -0.13, -0.36), 0.075, BONE, arm)
    sp = pivot("spearat", (-0.1, -0.14, -0.36), r.parts["arm-1"])
    cone("shaft", (0, 0, 0.1), 0.03, 0.03, 1.45, toon("shaft", 0x57525F), sp, outline=0.02, bevel=0)
    cone("spearhead", (0, 0, 0.96), 0.085, 0.0, 0.32, BONE, sp, outline=0.022, scale=(1, 0.45, 1), bevel=0)
    box("ribbon", (0.07, 0, 0.74), (0.14, 0.02, 0.08), toon("ribbon", 0xC14A6A), sp, outline=0.015)

    def pose(kind, t):
        s = math.sin(t * 2 * math.pi)
        r.body.location.z = 0.03 * abs(s)
        if kind == "walk":
            r.body.rotation_euler.x = rad(8)
            r.body.rotation_euler.y = rad(4) * s
            r.parts["arm1"].rotation_euler.x = rad(18) * s
            r.parts["arm-1"].rotation_euler.x = rad(10) * s
        elif kind == "attack":
            r.parts["arm-1"].rotation_euler.x = rad(-30 if t < 0.5 else 62)
            r.body.rotation_euler.x = rad(-8 if t < 0.5 else 18)
            r.body.rotation_euler.z = rad(-18 if t < 0.5 else 22)

    return r, pose


# ---- knight of the broken thread --------------------------------------------------------------
def threadknight():
    r = Rig()
    STEEL = toon("steel", 0x817A8E, dark=0.58)
    DARK = toon("darksteel", 0x5A5466)
    GLOW = flat("knighteye", 0xC88BFF)
    THREAD = toon("redthread", 0xC14A6A)
    for s in (-1, 1):
        leg = r.part(f"leg{s}", (0.17 * s, 0, 0.42))
        cone("leg", (0, 0, -0.16), 0.13, 0.12, 0.34, DARK, leg)
        ball("boot", (0, -0.05, -0.34), (0.15, 0.2, 0.09), STEEL, leg)
        cone("knee", (0, -0.1, -0.1), 0.09, 0.0, 0.12, STEEL, leg, rot=(rad(90), 0, 0), bevel=0)
    cone("tasset", (0, 0, 0.46), 0.37, 0.28, 0.22, DARK, r.body)
    cone("chest", (0, 0, 0.74), 0.28, 0.35, 0.44, STEEL, r.body)
    box("ridge", (0, -0.32, 0.76), (0.07, 0.08, 0.34), STEEL, r.body, outline=0.02)
    for x, z, a in ((-0.16, 0.8, 40), (0.14, 0.7, -35), (0.02, 0.62, 15)):
        box("thread", (x, -0.345, z), (0.26, 0.015, 0.02), THREAD, r.body, outline=0, rot=(0, rad(a), 0), bevel=0)
    cape = r.part("cape", (0, 0.28, 0.95))
    box("cape", (0, 0.07, -0.36), (0.5, 0.05, 0.74), toon("cape", 0x6A2F45), cape, rot=(rad(10), 0, 0), bevel=0.02)
    for s in (-1, 1):
        arm = r.part(f"arm{s}", (0.38 * s, 0, 0.9))
        ball("pauldron", (0.02 * s, 0, 0.02), (0.18, 0.18, 0.15), STEEL, arm)
        cone("arm", (0.06 * s, 0, -0.2), 0.09, 0.1, 0.32, DARK, arm, rot=(0, rad(-10 * s), 0))
        ball("gauntlet", (0.1 * s, -0.02, -0.4), 0.105, STEEL, arm)
    sw = pivot("swordat", (-0.1, -0.04, -0.42), r.parts["arm-1"])
    sw.rotation_euler = (rad(30), rad(-24), 0)
    BLADE = toon("blade", 0xD5DCE6, dark=0.65)
    box("blade", (0, 0, 0.58), (0.15, 0.045, 0.8), BLADE, sw, outline=0.026, bevel=0.015)
    cone("tip", (0, 0, 1.04), 0.1, 0.0, 0.18, BLADE, sw, outline=0.026, scale=(1, 0.4, 1), seg=4, rot=(0, 0, rad(45)), bevel=0)
    box("guard", (0, 0, 0.16), (0.38, 0.09, 0.07), DARK, sw, outline=0.024)
    cone("grip", (0, 0, 0.0), 0.04, 0.04, 0.24, THREAD, sw, outline=0.02)
    head = r.part("head", (0, 0, 1.02))
    ball("helm", (0, 0, 0.2), (0.29, 0.29, 0.3), STEEL, head)
    box("visor", (0, -0.26, 0.2), (0.36, 0.08, 0.075), flat("void", 0x1A1722), head, outline=0, bevel=0.02)
    for s in (-1, 1):
        ball("eye", (0.09 * s, -0.31, 0.2), (0.042, 0.02, 0.03), GLOW, head, outline=0)
    box("nose", (0, -0.29, 0.16), (0.05, 0.07, 0.3), STEEL, head, outline=0.018, bevel=0.015)
    cone("plume", (0, 0.1, 0.58), 0.09, 0.03, 0.32, THREAD, head, rot=(rad(-30), 0, 0), outline=0.025)

    def pose(kind, t):
        s = math.sin(t * 2 * math.pi)
        if kind == "walk":
            r.parts["leg1"].rotation_euler.x = rad(30) * s
            r.parts["leg-1"].rotation_euler.x = -rad(30) * s
            r.parts["arm1"].rotation_euler.x = -rad(20) * s
            r.parts["arm-1"].rotation_euler.x = rad(8) * s
            r.body.location.z = 0.04 * abs(math.cos(t * 2 * math.pi))
            r.parts["cape"].rotation_euler.x = rad(14 + 6 * s)
        elif kind == "attack":
            r.parts["arm-1"].rotation_euler.x = rad(-140 if t < 0.5 else -20)
            r.body.rotation_euler.x = rad(-6 if t < 0.5 else 16)
            r.body.rotation_euler.z = rad(14 if t < 0.5 else -20)
            r.parts["cape"].rotation_euler.x = rad(18)

    return r, pose


# ---- moss wolf ------------------------------------------------------------------------------
def wolf():
    r = Rig()
    FUR = toon("wolffur", 0x7F8A7A, dark=0.66)
    PALE = toon("wolfpale", 0xD6DCC8, dark=0.76)
    MOSS = toon("moss", 0x6BA84F, dark=0.7)
    ball("chest", (0, -0.12, 0.5), (0.27, 0.32, 0.28), FUR, r.body)
    ball("hips", (0, 0.34, 0.48), (0.22, 0.28, 0.23), FUR, r.body)
    ball("bib", (0, -0.34, 0.46), (0.17, 0.14, 0.2), PALE, r.body, outline=0)
    for x, y, z, s in ((0, -0.1, 0.76, 0.17), (-0.13, 0.12, 0.7, 0.13), (0.12, 0.3, 0.68, 0.12), (0, 0.5, 0.62, 0.11)):
        ball("moss", (x, y, z), (s, s * 1.1, s * 0.6), MOSS, r.body, outline=0.022, seg=18)
    cone("sprig", (0.05, -0.06, 0.92), 0.06, 0.0, 0.18, MOSS, r.body, outline=0.018, rot=(rad(10), rad(14), 0), bevel=0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg = r.part(f"leg{sx}{sy}", (0.15 * sx, 0.1 + 0.28 * sy, 0.36))
            cone("leg", (0, 0, -0.16), 0.06, 0.085, 0.34, FUR, leg, outline=0.024)
            ball("paw", (0, -0.03, -0.32), (0.08, 0.1, 0.055), PALE, leg, outline=0.02)
    tail = r.part("tail", (0, 0.58, 0.54))
    ball("tail", (0, 0.16, 0.1), (0.1, 0.26, 0.11), FUR, tail, rot=(rad(28), 0, 0))
    ball("tip", (0, 0.36, 0.22), (0.07, 0.11, 0.07), MOSS, tail, outline=0.02)
    head = r.part("head", (0, -0.4, 0.68))
    ball("head", (0, -0.04, 0.06), (0.24, 0.23, 0.21), FUR, head)
    ball("snout", (0, -0.27, -0.01), (0.11, 0.17, 0.095), PALE, head, outline=0.022)
    ball("nose", (0, -0.43, 0.03), 0.045, flat("eye", 0x2B1A10), head, outline=0)
    for s in (-1, 1):
        cone("ear", (0.15 * s, 0.03, 0.29), 0.09, 0.0, 0.24, FUR, head, outline=0.024, rot=(0, rad(14 * s), 0), bevel=0)
        ball("cheek", (0.2 * s, 0.02, -0.04), (0.09, 0.09, 0.1), PALE, head, outline=0.02)
        ball("eye", (0.1 * s, -0.21, 0.1), (0.045, 0.03, 0.05), flat("wolfeye", 0xFFE14D), head, outline=0.01)
        ball("pupil", (0.1 * s, -0.238, 0.1), (0.018, 0.012, 0.032), flat("eye", 0x2B1A10), head, outline=0)

    def pose(kind, t):
        s = math.sin(t * 2 * math.pi)
        if kind == "walk":
            for a in (-1, 1):
                for b in (-1, 1):
                    r.parts[f"leg{a}{b}"].rotation_euler.x = rad(36) * s * a * b
            r.body.location.z = 0.05 * abs(s)
            r.parts["tail"].rotation_euler.z = rad(14) * s
        elif kind == "attack":
            r.body.rotation_euler.x = rad(-16 if t < 0.5 else 14)
            r.body.location.y = 0.08 if t < 0.5 else -0.22
            r.parts["head"].rotation_euler.x = rad(-14 if t < 0.5 else 20)
            for b in (-1, 1):
                r.parts[f"leg{b}-1"].rotation_euler.x = rad(-30 if t < 0.5 else -62)

    return r, pose


# ---- lantern wisp ------------------------------------------------------------------------------
def wisp():
    r = Rig()
    IRON = toon("lanterniron", 0x6B5A48)
    GLASS = flat("lanternglass", 0xFFE9A0)
    LEAF = toon("wispleaf", 0x6BA84F, dark=0.7)
    BODY = toon("wispbody", 0xCFF0D0, dark=0.75)
    ball("glow", (0, 0, 0.6), (0.25, 0.25, 0.29), GLASS, r.body, outline=0.02)
    for i in range(6):
        a = i * math.pi / 3 + 0.52
        cone("bar", (0.27 * math.cos(a), 0.27 * math.sin(a), 0.6), 0.025, 0.025, 0.58, IRON, r.body, outline=0.016, bevel=0)
    cone("base", (0, 0, 0.3), 0.26, 0.3, 0.09, IRON, r.body, outline=0.024)
    cone("roof", (0, 0, 0.98), 0.36, 0.08, 0.26, IRON, r.body, outline=0.026)
    ring("loop", (0, 0, 1.18), 0.09, 0.025, IRON, r.body, outline=0.014, rot=(rad(90), 0, 0))
    for s in (-1, 1):
        ball("eye", (0.09 * s, -0.235, 0.64), (0.04, 0.03, 0.07), flat("eye", 0x2B1A10), r.body, outline=0)
        ball("blush", (0.16 * s, -0.21, 0.53), (0.045, 0.02, 0.025), flat("blush", 0xFF9C8C), r.body, outline=0)
        w = r.part(f"wing{s}", (0.24 * s, 0.12, 0.72))
        ball("wing", (0.24 * s, 0.06, 0.1), (0.26, 0.04, 0.15), LEAF, w, outline=0.022, rot=(0, rad(-28 * s), 0))
        arm = r.part(f"arm{s}", (0.28 * s, -0.04, 0.46))
        ball("hand", (0.1 * s, -0.1, -0.06), 0.075, BODY, arm, outline=0.022)
    for i in range(5):
        ball("trail", (0.05 * math.sin(i * 1.7), 0.04 * i, 0.22 - 0.06 * i), 0.11 - 0.018 * i, BODY, r.body, outline=0.02, seg=16)

    def pose(kind, t):
        s = math.sin(t * 2 * math.pi)
        r.body.location.z = 0.16 + 0.05 * s
        for q in (-1, 1):
            r.parts[f"wing{q}"].rotation_euler.y = rad(22 * q) * s
        if kind == "walk":
            r.body.rotation_euler.x = rad(10)
        elif kind == "attack":
            r.body.rotation_euler.x = rad(-18 if t < 0.5 else 26)
            for q in (-1, 1):
                r.parts[f"arm{q}"].rotation_euler.x = rad(-100 if t < 0.5 else -30)

    return r, pose


# ---- honey bear ----------------------------------------------------------------------------------
def bear():
    r = Rig()
    FUR = toon("bearfur", 0xA8703C, dark=0.66)
    PALE = toon("bearpale", 0xE8C48A, dark=0.76)
    HONEY = toon("honey", 0xFFB52E, dark=0.75, light=1.2)
    ball("body", (0, 0, 0.62), (0.5, 0.46, 0.52), FUR, r.body)
    ball("tummy", (0, -0.2, 0.56), (0.34, 0.3, 0.38), PALE, r.body, outline=0)
    for s in (-1, 1):
        leg = r.part(f"leg{s}", (0.25 * s, -0.02, 0.28))
        cone("leg", (0, 0, -0.1), 0.18, 0.2, 0.3, FUR, leg)
        ball("foot", (0, -0.12, -0.2), (0.19, 0.22, 0.1), FUR, leg)
        ball("pad", (0, -0.32, -0.19), (0.09, 0.03, 0.06), PALE, leg, outline=0)
        arm = r.part(f"arm{s}", (0.44 * s, -0.04, 0.84))
        ball("arm", (0.1 * s, -0.06, -0.2), (0.15, 0.16, 0.28), FUR, arm, rot=(rad(-14), rad(-16 * s), 0))
        ball("paw", (0.16 * s, -0.16, -0.42), (0.15, 0.15, 0.13), FUR, arm)
    # honey pot under the left arm and drips on the belly
    jar = pivot("jar", (0.2, -0.26, -0.34), r.parts["arm1"])
    ball("pot", (0, 0, 0), (0.17, 0.17, 0.17), toon("pot", 0xC97B4A), jar, outline=0.024)
    cone("rim", (0, 0, 0.15), 0.15, 0.15, 0.06, toon("pot", 0xC97B4A), jar, outline=0.02)
    ball("top", (0, 0, 0.17), (0.13, 0.13, 0.05), HONEY, jar, outline=0.016)
    for x, z, h in ((-0.12, 0.6, 0.1), (0.02, 0.52, 0.13), (0.13, 0.62, 0.08)):
        ball("drip", (x, -0.49, z), (0.05, 0.03, h), HONEY, r.body, outline=0.014, seg=16)
    head = r.part("head", (0, -0.06, 1.06))
    ball("head", (0, -0.02, 0.16), (0.36, 0.33, 0.31), FUR, head)
    ball("muzzle", (0, -0.31, 0.07), (0.17, 0.13, 0.13), PALE, head, outline=0.022)
    ball("nose", (0, -0.43, 0.12), (0.07, 0.045, 0.05), flat("eye", 0x2B1A10), head, outline=0)
    ball("smear", (0.08, -0.42, 0.01), (0.07, 0.03, 0.04), HONEY, head, outline=0.01, seg=14)
    for s in (-1, 1):
        ball("ear", (0.27 * s, 0.02, 0.42), (0.12, 0.07, 0.12), FUR, head)
        ball("earin", (0.27 * s, -0.04, 0.42), (0.07, 0.03, 0.07), PALE, head, outline=0)
    eyes(head, 0.15, -0.29, 0.22, 0.055)

    def pose(kind, t):
        s = math.sin(t * 2 * math.pi)
        if kind == "walk":
            r.parts["leg1"].rotation_euler.x = rad(28) * s
            r.parts["leg-1"].rotation_euler.x = -rad(28) * s
            r.body.rotation_euler.y = rad(6) * s
            r.body.location.z = 0.03 * abs(s)
        elif kind == "attack":
            r.parts["arm-1"].rotation_euler.x = rad(-150 if t < 0.5 else -40)
            r.body.rotation_euler.x = rad(-8 if t < 0.5 else 18)
            r.body.rotation_euler.z = rad(-12 if t < 0.5 else 22)

    return r, pose


# ---- the old sleeping tree (boss) ------------------------------------------------------------------
def treant():
    r = Rig()
    BARK = toon("oldbark", 0x7A5638, dark=0.62)
    LEAF = toon("oldleaf", 0x5FA04A, dark=0.68)
    LEAF2 = toon("oldleaf2", 0x86C264, dark=0.75)
    MOSS = toon("moss", 0x6BA84F, dark=0.7)
    cone("trunk", (0, 0, 0.72), 0.52, 0.4, 1.3, BARK, r.body)
    for s in (-1, 1):
        leg = r.part(f"leg{s}", (0.28 * s, 0, 0.3))
        cone("root", (0.05 * s, -0.03, -0.12), 0.26, 0.2, 0.42, BARK, leg)
        for a in (-40, 0, 40):
            ball("toe", (0.05 * s + 0.2 * math.sin(rad(a)), -0.2 * math.cos(rad(a)) - 0.03, -0.26), (0.1, 0.14, 0.07), BARK, leg, outline=0.024, rot=(0, 0, rad(a)))
        arm = r.part(f"arm{s}", (0.42 * s, 0, 1.08))
        cone("arm", (0.22 * s, -0.04, -0.1), 0.1, 0.15, 0.6, BARK, arm, rot=(0, rad(-56 * s), 0))
        cone("fore", (0.46 * s, -0.14, -0.38), 0.15, 0.11, 0.5, BARK, arm, rot=(rad(-18), rad(-14 * s), 0))
        for a in (-30, 0, 30):
            cone("finger", (0.5 * s + 0.1 * math.sin(rad(a)), -0.24, -0.68), 0.055, 0.015, 0.26, BARK, arm, outline=0.022, rot=(rad(180 - 14), rad(a), 0), bevel=0)
        ball("tuft", (0.4 * s, 0.02, 0.06), (0.17, 0.15, 0.11), MOSS, arm, outline=0.024)
    dark = flat("hollowface", 0x2A1A10)
    for s in (-1, 1):  # sleepy half-closed eyes
        ball("socket", (0.17 * s, -0.4, 1.0), (0.12, 0.05, 0.1), dark, r.body, outline=0)
        ball("eye", (0.17 * s, -0.435, 0.97), (0.06, 0.03, 0.05), flat("treeeye", 0xFFD76A), r.body, outline=0)
        box("lid", (0.17 * s, -0.44, 1.05), (0.28, 0.09, 0.1), BARK, r.body, outline=0.02, rot=(0, rad(12 * s), 0), bevel=0.03)
    cone("nose", (0, -0.5, 0.86), 0.08, 0.04, 0.26, BARK, r.body, outline=0.022, rot=(rad(64), 0, 0))
    ball("mouth", (0, -0.45, 0.62), (0.17, 0.05, 0.07), dark, r.body, outline=0)
    for i in range(7):
        x = -0.27 + 0.09 * i
        cone("beard", (x, -0.44 + abs(x) * 0.3, 0.46), 0.06, 0.0, 0.34 - abs(x) * 0.5, MOSS, r.body, outline=0.02, rot=(rad(180), 0, 0), bevel=0)
    ball("crown", (0, 0, 1.72), (0.78, 0.74, 0.5), LEAF, r.body, outline=0.035)
    rnd = random.Random(5)
    for i in range(9):
        a = i * 2 * math.pi / 9
        sz = 0.3 + rnd.random() * 0.07
        ball("blob", (0.6 * math.cos(a), 0.58 * math.sin(a), 1.56 + rnd.random() * 0.2), sz, LEAF, r.body, outline=0.03, seg=20)
    for x, y, z, sz in ((-0.2, -0.3, 2.06, 0.3), (0.26, -0.2, 2.0, 0.28), (0, 0.1, 2.2, 0.28), (-0.5, -0.36, 1.76, 0.2)):
        ball("light", (x, y, z), sz, LEAF2, r.body, outline=0.026, seg=20)
    for x, y, z in ((0.4, -0.52, 1.6), (-0.1, -0.68, 1.62), (-0.6, -0.2, 1.5)):
        ball("flower", (x, y, z), 0.085, toon("treeflower", 0xFFB8D8, dark=0.82), r.body, outline=0.02, seg=14)
    # a bird's nest on top
    ring("nest", (0.16, -0.1, 2.36), 0.15, 0.06, toon("straw", 0xE8C86A), r.body, outline=0.02)
    for x in (0.1, 0.22):
        ball("egg", (x, -0.12, 2.4), (0.055, 0.055, 0.07), toon("egg", 0xD6ECFF, dark=0.85), r.body, outline=0.014, seg=14)

    def pose(kind, t):
        s = math.sin(t * 2 * math.pi)
        if kind == "walk":
            r.parts["leg1"].rotation_euler.x = rad(20) * s
            r.parts["leg-1"].rotation_euler.x = -rad(20) * s
            r.body.rotation_euler.y = rad(5) * s
            for q in (-1, 1):
                r.parts[f"arm{q}"].rotation_euler.x = rad(12) * s * q
        elif kind == "attack":
            for q in (-1, 1):
                r.parts[f"arm{q}"].rotation_euler.x = rad(-130 if t < 0.5 else -24)
            r.body.rotation_euler.x = rad(-8 if t < 0.5 else 16)

    return r, pose


# name: (builder, frame width, frame height, world height shown, camera look height)
MONSTERS = {
    "hen": (lambda: hen(), 120, 96, 1.75, 0.5),
    "rat": (lambda: rat(), 112, 96, 1.92, 0.42),
    "scarecrow": (lambda: scarecrow(), 128, 144, 2.45, 0.78),
    "henqueen": (lambda: hen(0xFFE2B8, 0xFF2A00, True), 224, 192, 2.1, 0.6),
    "shadow": (lambda: shadow(), 96, 120, 2.05, 0.64),
    "hunter": (lambda: hunter(), 144, 168, 3.0, 0.92),
    "wolf": (lambda: wolf(), 136, 112, 1.95, 0.48),
    "wisp": (lambda: wisp(), 112, 112, 2.0, 0.66),
    "bear": (lambda: bear(), 152, 152, 2.35, 0.74),
    "treant": (lambda: treant(), 296, 296, 3.7, 1.2),
    "threadknight": (lambda: threadknight(), 176, 184, 2.95, 0.9),
}
FRAMES = [("idle", 0)] + [("walk", i / 4) for i in range(4)] + [("attack", 0.0), ("attack", 0.75)]

os.makedirs(OUT, exist_ok=True)
only = [a for a in args[1:] if a in MONSTERS]
for name, (build, w, h, view, look) in MONSTERS.items():
    if only and name not in only:
        continue
    reset()
    kit._mats.clear()
    stage(w, h, view, look)
    rig, pose = build()
    rows = []
    if PREVIEW:
        bpy.context.scene.render.resolution_percentage = 200
        row = []
        for f, (kind, t) in ((0, ("idle", 0)), (1, ("walk", 0.25)), (7, ("attack", 0.0)), (6, ("attack", 0.75)), (4, ("idle", 0))):
            rig.rest()
            rig.turn.rotation_euler.z = -rad(45) * f
            pose(kind, t)
            row.append(render_array())
        save_sheet([row], os.path.join(OUT, f"preview-{name}.png"))
        continue
    for f in range(8):
        row = []
        for kind, t in FRAMES:
            rig.rest()
            rig.turn.rotation_euler.z = -rad(45) * f
            pose(kind, t)
            row.append(render_array())
        rows.append(row)
    save_sheet(rows, os.path.join(OUT, f"mon-{name}.png"))

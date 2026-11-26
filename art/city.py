"""The capital, Aldermere: castle, clock tower, tall town houses, the fountain,
city walls, street lamps and market clutter.

Rendered into its own atlas (city.png + city.json) by scenery.py:
blender --background --factory-startup --python art/scenery.py -- <out dir> city
"""
import math
import random

import bpy
from kit import ball, box, cone, flat, pivot, ring, srgb, toon

rad = math.radians
T = 64 / 40 / math.sqrt(2)  # one tile in units


def tile_space():
    """Local x = the tile grid's x axis, local -y = the grid's y axis."""
    p = pivot("grid", (0, 0, 0))
    p.rotation_euler.z = rad(-45)
    return p


def mesh(name, verts, faces, mat, parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    ob.parent = parent
    return ob


def shade(c, k):
    return tuple(min(1, v * k) for v in srgb(c))


# ---- palette -------------------------------------------------------------------------
def mats():
    return {
        "white": toon("cwhite", 0xEFE8DA, dark=0.74),
        "white2": toon("cwhite2", 0xDCD3C2, dark=0.74),
        "slate": toon("cslate", 0x4F6E9E, dark=0.62),
        "slate2": toon("cslate2", 0x3E5A86, dark=0.62),
        "rock": toon("crock", 0x8E8577, dark=0.66),
        "rock2": toon("crock2", 0x786F63, dark=0.66),
        "grass": toon("cgrass", 0x6CBF55, dark=0.7),
        "leaf": toon("cleaf", 0xE3B23A, dark=0.7),
        "leaf2": toon("cleaf2", 0x5CAE4E, dark=0.7),
        "dark": flat("cdark", 0x2A2430),
        "glass": toon("cglass", 0x9ADBFF, dark=0.85),
        "warm": flat("cwarm", 0xFFD27A),
        "red": toon("cred", 0xD13B3B, dark=0.7),
        "gold": toon("gold", 0xF2B82E, dark=0.7),
        "wood": toon("wood", 0x8A5A32),
        "beam": toon("beam", 0x5E3A22),
        "stone": toon("stone", 0xA8A198),
        "iron": toon("ciron", 0x3E3B44, dark=0.6, light=1.4),
    }


def crenels(M, parent, x0, x1, y, z, along="x", n=None, size=0.16, mat=None):
    """Little teeth along the top of a wall."""
    n = n or max(2, int(abs(x1 - x0) / (size * 2)))
    for i in range(n):
        t = x0 + (x1 - x0) * (i + 0.5) / n
        loc = (t, y, z) if along == "x" else (y, t, z)
        box("crenel", loc, (size, size, size * 1.1), mat or M["white"], parent, outline=0.016, bevel=0.01)


def flag(M, at, h=0.9, s=1.0, color=None):
    x, y, z = at
    cone("pole", (x, y, z + h / 2), 0.02 * s, 0.02 * s, h, M["iron"], outline=0.012, bevel=0)
    F = toon(f"flag{color}", color, dark=0.72) if color else M["red"]
    box("flag", (x + 0.26 * s, y, z + h - 0.16 * s), (0.5 * s, 0.03, 0.28 * s), F, outline=0.014, rot=(0, rad(-6), rad(-8)), bevel=0)


def tower(M, x, y, z, r, h, roof=1.0, flagged=True, wins=3, mat="white"):
    """Round tower with a pointed blue roof."""
    cone("tower", (x, y, z + h / 2), r * 1.04, r, h, M[mat], seg=24, bevel=0.02)
    ring("band", (x, y, z + h - 0.05), r * 1.06, 0.045, M["white2"], outline=0.014)
    cone("roof", (x, y, z + h + roof * r * 1.6 / 2), r * 1.22, 0.0, roof * r * 1.6, M["slate"], seg=24, bevel=0)
    ball("tip", (x, y, z + h + roof * r * 1.6 + 0.04), 0.06, M["gold"], outline=0.012, seg=12)
    for k in range(wins):
        zz = z + h * (0.3 + 0.55 * k / max(1, wins - 1)) if wins > 1 else z + h * 0.6
        box("win", (x, y - r * 0.98, zz), (r * 0.28, 0.05, r * 0.5), M["dark"], outline=0, bevel=0)
        box("win2", (x + r * 0.7, y - r * 0.7, zz), (r * 0.24, 0.05, r * 0.46), M["dark"], outline=0, rot=(0, 0, rad(45)), bevel=0)
    if flagged:
        flag(M, (x, y, z + h + roof * r * 1.6), h=0.7 + r * 0.6, s=0.6 + r * 0.5)


# ---- the castle (9 x 9 tiles, on its own rocky hill) ----------------------------------------
def castle():
    M = mats()
    rnd = random.Random(7)
    g = tile_space()
    side = 4.5 * T  # half of the footprint
    # the hill: a stone plinth, grass on top, boulders round the foot
    box("plinth", (0, 0, 0.5), (2 * side - 0.3, 2 * side - 0.3, 1.0), M["rock"], g, bevel=0.12)
    box("lawn", (0, 0, 1.02), (2 * side - 0.55, 2 * side - 0.55, 0.08), M["grass"], g, outline=0.02, bevel=0.03)
    for i in range(36):
        t = i / 36 * 4
        k = t % 1
        e = int(t)
        x, y = ((-side + 2 * side * k, -side), (side, -side + 2 * side * k), (side - 2 * side * k, side), (-side, side - 2 * side * k))[e]
        s = 0.3 + rnd.random() * 0.25
        if x > side * 0.6 and y < -side * 0.6:
            continue  # the stairs come down here
        ball("boulder", (x * 0.97, y * 0.97, 0.25 + rnd.random() * 0.35), (s, s * 0.9, s * 0.8), M["rock2" if i % 3 else "rock"], g, outline=0.024, seg=12)
    # trees and flowers on the lawn, at the left and right tips of the hill
    for x, y in ((-side + 0.9, side - 0.9), (-side + 1.6, side - 0.7), (side - 0.9, -side + 0.9), (side - 0.7, -side + 1.7), (-side + 0.8, -side + 0.8), (side - 1.0, side - 1.0)):
        cone("trunk", (x, -y, 1.35), 0.1, 0.07, 0.6, M["wood"], g, outline=0.018)
        ball("crown", (x, -y, 1.95), (0.5, 0.5, 0.45), M["leaf"] if rnd.random() < 0.5 else M["leaf2"], g, outline=0.026, seg=16)
    for i in range(30):
        a = rnd.random() * math.tau
        r = side * (0.75 + rnd.random() * 0.15)
        c = (0xFF6FA8, 0xFFFFFF, 0x8FB8FF, 0xFFE14D)[i % 4]
        ball("bloom", (r * math.cos(a), r * math.sin(a), 1.08), 0.07, toon(f"bloom{c}", c, dark=0.82), g, outline=0.012, seg=10)

    Z = 1.06  # the castle stands on top
    # grand stairs down the front tip of the hill, toward the town
    for i in range(8):
        y = -3.7 - i * 0.4
        top = Z + 0.02 - i * 0.14
        box("stair", (0, y, top / 2), (2.0, 0.42, top), M["white2" if i % 2 else "white"], outline=0.018, bevel=0.02)
    for s in (-1, 1):
        box("stairwall", (1.08 * s, -5.1, 0.42), (0.2, 3.0, 0.84), M["white2"], outline=0.018, bevel=0.02)
        cone("stairpost", (1.08 * s, -6.65, 0.5), 0.14, 0.14, 1.0, M["white"], outline=0.018, seg=8, bevel=0.02)
        ball("lampglow", (1.08 * s, -6.65, 1.1), 0.12, M["warm"], outline=0.014, seg=12)
    # outer wall with four corner towers and a gatehouse facing the town
    W, H = 3.3, 1.7
    for (x, y, sx, sy) in ((0, -W, 2 * W, 0.42), (0, W, 2 * W, 0.42), (-W, 0, 0.42, 2 * W), (W, 0, 0.42, 2 * W)):
        box("wall", (x, y, Z + H / 2), (sx, sy, H), M["white"], bevel=0.03)
        if sx > sy:
            crenels(M, None, x - W + 0.4, x + W - 0.4, y - 0.12, Z + H + 0.08, "x")
        else:
            crenels(M, None, y - W + 0.4, y + W - 0.4, x - 0.12, Z + H + 0.08, "y")
    for x in (-W, W):
        for y in (-W, W):
            tower(M, x, y, Z, 0.62, 2.9, roof=1.1, wins=2)
    # gatehouse
    box("gatehouse", (0, -W - 0.15, Z + 1.35), (1.9, 0.9, 2.7), M["white"], bevel=0.04)
    crenels(M, None, -0.85, 0.85, -W - 0.55, Z + 2.78, "x", n=5)
    box("arch", (0, -W - 0.62, Z + 0.75), (0.9, 0.06, 1.3), M["dark"], outline=0.02, bevel=0)
    cone("archtop", (0, -W - 0.62, Z + 1.4), 0.45, 0.45, 0.06, M["dark"], outline=0.02, rot=(rad(90), 0, 0), seg=24, bevel=0)
    for k in range(5):
        box("bar", (-0.32 + 0.16 * k, -W - 0.67, Z + 0.9), (0.04, 0.03, 1.5), M["iron"], outline=0, bevel=0)
    for s in (-1, 1):
        tower(M, 0.95 * s, -W - 0.35, Z, 0.36, 3.2, roof=1.2, wins=2)
        box("banner", (0.48 * s, -W - 0.63, Z + 1.95), (0.32, 0.03, 0.9), M["red"], outline=0.014, bevel=0)
        ball("crest", (0.48 * s, -W - 0.66, Z + 2.05), 0.08, M["gold"], outline=0.012, seg=10)
    # the keep: a big white hall with a slate roof
    box("keep", (0, 0.8, Z + 2.0), (4.0, 3.0, 4.0), M["white"], bevel=0.04)
    for side_ in (-1, 1):
        box("keeproof", (0, 0.8 + 0.78 * side_, Z + 4.75), (4.3, 1.75, 0.12), M["slate2" if side_ > 0 else "slate"], rot=(rad(-40) * side_, 0, 0), bevel=0.02)
    mesh_pts = []
    for x in (-2.0, 2.0):
        mesh("gable", [(x, -0.7, Z + 4.0), (x, 2.3, Z + 4.0), (x, 0.8, Z + 5.3)], [(0, 1, 2)], M["white2"])
    # rows of windows and a round rose window on the front of the keep
    for row, z in enumerate((Z + 1.2, Z + 2.4, Z + 3.4)):
        for i in range(6):
            x = -1.6 + i * 0.64
            if abs(x) < 0.5 and row == 1:
                continue
            box("kwin", (x, -0.72, z), (0.2, 0.05, 0.42 if row < 2 else 0.3), M["dark"], outline=0, bevel=0)
            box("kwinlit", (x, -0.74, z - 0.1), (0.14, 0.04, 0.12), M["warm"], outline=0, bevel=0) if (i + row) % 3 == 0 else None
    cone("rose", (0, -0.74, Z + 2.5), 0.42, 0.42, 0.05, toon("rose", 0x6A9AE0, dark=0.8), outline=0.02, rot=(rad(90), 0, 0), seg=24, bevel=0)
    for k in range(8):
        a = k * math.pi / 4
        box("spoke", (0.2 * math.cos(a), -0.78, Z + 2.5 + 0.2 * math.sin(a)), (0.36, 0.02, 0.035), M["white2"], outline=0, rot=(0, -a, 0), bevel=0)
    box("door", (0, -0.75, Z + 0.55), (0.8, 0.06, 1.1), toon("kdoor", 0x7A4A2A), outline=0.02, bevel=0)
    # many towers rising behind and around the keep
    tower(M, -1.9, -0.2, Z, 0.55, 4.6, roof=1.3, wins=3)
    tower(M, 1.9, -0.2, Z, 0.55, 4.9, roof=1.3, wins=3)
    tower(M, -1.3, 2.3, Z, 0.7, 5.6, roof=1.3, wins=3)
    tower(M, 1.4, 2.2, Z, 0.66, 5.2, roof=1.3, wins=3)
    tower(M, 0.0, 1.4, Z, 0.95, 7.0, roof=1.45, wins=4)
    # balcony ring round the main tower
    ring("balcony", (0, 1.4, Z + 5.2), 1.08, 0.07, M["white2"], outline=0.016)
    for k in range(12):
        a = k * math.tau / 12
        box("rail", (1.08 * math.cos(a), 1.4 + 1.08 * math.sin(a), Z + 5.35), (0.08, 0.08, 0.26), M["white2"], outline=0.012, bevel=0)
    tower(M, 0.55, 0.35, Z + 4.0, 0.32, 1.6, roof=1.4, wins=1)
    tower(M, -0.6, 0.4, Z + 4.0, 0.3, 1.4, roof=1.4, wins=1)
    # ivy on the walls
    for i in range(14):
        x = rnd.uniform(-W + 0.3, W - 0.3)
        ball("ivy", (x, -W - 0.22, Z + rnd.uniform(0.1, 0.9)), (0.2, 0.08, 0.24), M["leaf2"], outline=0.016, seg=12)


# ---- clock tower (2 x 2) --------------------------------------------------------------------
def clocktower():
    M = mats()
    g = tile_space()
    s = 0.78
    box("base", (0, 0, 0.3), (2 * s + 0.24, 2 * s + 0.24, 0.6), M["rock"], g, bevel=0.05)
    box("shaft", (0, 0, 2.4), (2 * s, 2 * s, 3.8), M["white2"], g, bevel=0.03)
    for z in (0.62, 2.0, 3.4, 4.3):
        box("course", (0, 0, z), (2 * s + 0.08, 2 * s + 0.08, 0.1), M["rock"], g, outline=0.016, bevel=0.01)
    for k in range(4):
        x, y = ((-s + 0.02, -s + 0.02), (s - 0.02, -s + 0.02), (s - 0.02, s - 0.02), (-s + 0.02, s - 0.02))[k]
        box("pilaster", (x, y, 2.4), (0.22, 0.22, 3.8), M["white"], g, outline=0.018, bevel=0.02)
    # door and windows on the two faces we see
    box("door", (0, -s - 0.02, 0.95), (0.5, 0.06, 0.8), toon("cdoor", 0x7A4A2A), g, outline=0.018, bevel=0)
    for z in (1.6, 2.7):
        box("slit", (0, -s - 0.02, z), (0.16, 0.05, 0.42), M["dark"], g, outline=0, bevel=0)
        box("slit", (s + 0.02, 0, z), (0.05, 0.16, 0.42), M["dark"], g, outline=0, bevel=0)
    # clock faces
    FACE = toon("clockface", 0xFFF6DE, dark=0.85)
    for (x, y, rx, rz) in ((0, -s - 0.04, rad(90), 0), (s + 0.04, 0, rad(90), rad(90))):
        cone("clockrim", (x, y, 3.85), 0.5, 0.5, 0.06, M["gold"], g, outline=0.02, rot=(rx, 0, rz), seg=32, bevel=0)
        cone("clock", (x * 1.01 + (0.01 if x else 0), y * 1.01 - (0.0 if x else 0.01), 3.85), 0.42, 0.42, 0.06, FACE, g, outline=0, rot=(rx, 0, rz), seg=32, bevel=0)
        for k in range(12):
            a = k * math.pi / 6
            off = (0.34 * math.cos(a), 0.34 * math.sin(a))
            loc = (x - 0.04 if not x else x + 0.05, y - 0.05 if not x else y, 3.85)
            if not x:
                loc = (off[0], y - 0.05, 3.85 + off[1])
            else:
                loc = (x + 0.05, -off[0], 3.85 + off[1])
            box("tick", loc, (0.04, 0.04, 0.04), M["dark"], g, outline=0, bevel=0)
        if not x:
            box("hand", (0.0, y - 0.07, 3.97), (0.04, 0.02, 0.26), M["dark"], g, outline=0, bevel=0)
            box("hand2", (0.1, y - 0.07, 3.85), (0.2, 0.02, 0.035), M["dark"], g, outline=0, bevel=0)
        else:
            box("hand", (x + 0.07, 0, 3.97), (0.02, 0.04, 0.26), M["dark"], g, outline=0, bevel=0)
            box("hand2", (x + 0.07, -0.1, 3.85), (0.02, 0.2, 0.035), M["dark"], g, outline=0, bevel=0)
    # open belfry with a bell, then the spire
    for k in range(4):
        x, y = ((-s + 0.12, -s + 0.12), (s - 0.12, -s + 0.12), (s - 0.12, s - 0.12), (-s + 0.12, s - 0.12))[k]
        box("belfrypost", (x, y, 4.85), (0.22, 0.22, 1.0), M["white"], g, outline=0.018, bevel=0.02)
    box("belfryfloor", (0, 0, 4.36), (2 * s + 0.3, 2 * s + 0.3, 0.12), M["rock"], g, outline=0.018, bevel=0.02)
    crenels(M, g, -s, s, -s - 0.12, 4.5, "x", n=5, size=0.12, mat=M["white"])
    crenels(M, g, -s, s, s + 0.12, 4.5, "y", n=5, size=0.12, mat=M["white"])
    cone("bell", (0, 0, 4.8), 0.32, 0.16, 0.42, M["gold"], g, outline=0.02, seg=20)
    box("belfrytop", (0, 0, 5.4), (2 * s + 0.2, 2 * s + 0.2, 0.14), M["white2"], g, outline=0.018, bevel=0.02)
    cone("spire", (0, 0, 6.3), 1.15, 0.0, 1.7, M["slate"], g, seg=4, rot=(0, 0, rad(45)), bevel=0)
    ball("spiretip", (0, 0, 7.2), 0.08, M["gold"], g, outline=0.014, seg=12)
    cone("vane", (0, 0, 7.45), 0.015, 0.015, 0.4, M["iron"], g, outline=0.01, bevel=0)
    box("arrow", (0.1, 0, 7.55), (0.32, 0.02, 0.07), M["iron"], g, outline=0.01, bevel=0)


# ---- tall town houses (2 x 2) ------------------------------------------------------------------
def townhouse(seed, roof, wall, shop=None, sign=None, tall=2):
    M = mats()
    rnd = random.Random(seed)
    g = tile_space()
    WALL = toon(f"thwall{wall}", wall, dark=0.78)
    BEAM = M["beam"]
    ROOF = toon(f"throof{roof}", roof, dark=0.68)
    ROOF2 = toon(f"throofb{roof}", shade(roof, 0.82), dark=0.7)
    STONE = toon("thstone", 0xB0A79A, dark=0.72)
    s = 0.98
    box("plinth", (0, 0, 0.08), (2 * s + 0.16, 2 * s + 0.16, 0.16), STONE, g, outline=0.018, bevel=0.03)
    # ground floor of stone blocks
    box("ground", (0, 0, 0.6), (2 * s, 2 * s, 0.96), STONE, g, bevel=0.03)
    for k in range(10):
        z = 0.25 + (k % 3) * 0.3
        box("blockline", (-s + 0.2 + (k * 0.37) % (2 * s - 0.3), -s - 0.01, z), (0.3, 0.02, 0.025), toon("thmortar", 0x8F877C), g, outline=0, bevel=0)
    # upper floors jut out over the street, half-timbered
    o = 0.14
    top = 1.08
    for f in range(tall):
        z0 = top + f * 0.95
        box("upper", (o / 2, -o / 2, z0 + 0.46), (2 * s + o, 2 * s + o, 0.92), WALL, g, bevel=0.02)
        box("sill", (o / 2, -o / 2, z0 + 0.02), (2 * s + o + 0.08, 2 * s + o + 0.08, 0.08), BEAM, g, outline=0.016, bevel=0.01)
        # beams on the two faces we see
        for i in range(5):
            t = -s + i * (2 * s) / 4
            box("post", (t + o / 2, -s - o - 0.005, z0 + 0.46), (0.07, 0.04, 0.92), BEAM, g, outline=0.012, bevel=0)
            box("post", (s + o + 0.005, t - o / 2, z0 + 0.46), (0.04, 0.07, 0.92), BEAM, g, outline=0.012, bevel=0)
        for i in range(4):
            t = -s + (i + 0.5) * (2 * s) / 4
            a = 38 if i % 2 else -38
            box("brace", (t + o / 2, -s - o - 0.01, z0 + 0.25), (0.05, 0.035, 0.5), BEAM, g, outline=0.01, rot=(0, rad(a), 0), bevel=0)
            box("brace", (s + o + 0.01, t - o / 2, z0 + 0.25), (0.035, 0.05, 0.5), BEAM, g, outline=0.01, rot=(rad(a), 0, 0), bevel=0)
        # windows with flower boxes
        for t in (-0.5, 0.5):
            lit = rnd.random() < 0.35
            GL = M["warm"] if lit else M["glass"]
            box("win", (t + o / 2, -s - o - 0.03, z0 + 0.55), (0.3, 0.04, 0.38), GL, g, outline=0.016, bevel=0)
            box("winbar", (t + o / 2, -s - o - 0.05, z0 + 0.55), (0.03, 0.02, 0.38), BEAM, g, outline=0, bevel=0)
            box("win", (s + o + 0.03, t - o / 2, z0 + 0.55), (0.04, 0.3, 0.38), GL, g, outline=0.016, bevel=0)
            box("winbar", (s + o + 0.05, t - o / 2, z0 + 0.55), (0.02, 0.03, 0.38), BEAM, g, outline=0, bevel=0)
            if rnd.random() < 0.75:
                box("fbox", (t + o / 2, -s - o - 0.1, z0 + 0.32), (0.38, 0.12, 0.1), BEAM, g, outline=0.012, bevel=0)
                for k in range(4):
                    c = (0xFF5A7A, 0xFFE14D, 0xFFFFFF, 0xFF8A3A)[(k + seed) % 4]
                    ball("bloom", (t + o / 2 - 0.13 + k * 0.09, -s - o - 0.12, z0 + 0.4), 0.055, toon(f"bloom{c}", c, dark=0.8), g, outline=0.01, seg=10)
            if rnd.random() < 0.75:
                box("fbox", (s + o + 0.1, t - o / 2, z0 + 0.32), (0.12, 0.38, 0.1), BEAM, g, outline=0.012, bevel=0)
                for k in range(4):
                    c = (0xFF5A7A, 0xFFE14D, 0xFFFFFF, 0xC06AFF)[(k + seed + 1) % 4]
                    ball("bloom", (s + o + 0.12, t - o / 2 - 0.13 + k * 0.09, z0 + 0.4), 0.055, toon(f"bloom{c}", c, dark=0.8), g, outline=0.01, seg=10)
    # steep roof, ridge along x so the gable faces the right street
    rz = top + tall * 0.95
    ridge = rz + 1.35
    hs = s + o + 0.1
    slope = math.atan2(ridge - rz, hs)
    length = math.hypot(ridge - rz, hs) + 0.16
    for sd in (-1, 1):
        for i in range(6):
            d = (i + 0.5) / 6 * length
            y = sd * (length - d) * math.cos(slope) - o / 2
            z = ridge - (length - d) * math.sin(slope) + 0.05
            box("shingles", (o / 2, y, z), (2 * hs + 0.22, length / 6 + 0.07, 0.07), ROOF if i % 2 else ROOF2, g, outline=0.018, rot=(-slope * sd, 0, 0), bevel=0.015)
    mesh("gable", [(s + o, -hs + 0.02 - o / 2, rz), (s + o, hs - 0.02 - o / 2, rz), (s + o, -o / 2, ridge - 0.08)], [(0, 1, 2)], WALL, g)
    box("gwin", (s + o + 0.02, -o / 2, rz + 0.45), (0.04, 0.26, 0.34), M["glass"], g, outline=0.014, bevel=0)
    box("kingpost", (s + o + 0.02, -o / 2, rz + 0.62), (0.05, 0.06, 1.1), BEAM, g, outline=0.012, bevel=0)
    cone("ridgecap", (o / 2, -o / 2, ridge + 0.06), 0.07, 0.07, 2 * hs + 0.3, ROOF2, g, rot=(0, rad(90), 0), bevel=0.02)
    box("chimney", (-0.4, 0.4, ridge - 0.3), (0.3, 0.3, 0.9), STONE, g, outline=0.018, bevel=0.02)
    # ground floor: a shop with an awning, or a plain door
    if shop is not None:
        A = toon(f"awn{shop}", shop, dark=0.72)
        P = toon("awnpale", 0xFFF3DC, dark=0.8)
        box("shopwin", (0.35, -s - 0.02, 0.62), (0.7, 0.04, 0.5), M["warm"], g, outline=0.016, bevel=0)
        for i in range(7):
            box("awning", (-0.05 + i * 0.13, -s - 0.28, 1.0), (0.13, 0.56, 0.04), A if i % 2 else P, g, outline=0.012, rot=(rad(-22), 0, 0), bevel=0)
        for k in range(3):
            c = (0xE8483C, 0xFFC23A, 0x6CC472)[k]
            ball("goods", (0.1 + k * 0.22, -s - 0.2, 0.4), 0.08, toon(f"goods{c}", c, dark=0.78), g, outline=0.014, seg=12)
        box("crate", (0.35, -s - 0.22, 0.2), (0.62, 0.3, 0.28), M["wood"], g, outline=0.016, bevel=0.01)
    box("door", (-0.5 if shop is not None else 0.0, -s - 0.02, 0.48), (0.42, 0.06, 0.72), toon("thdoor", 0x7A4A2A), g, outline=0.016, bevel=0)
    box("doorlamp", (-0.18 if shop is not None else 0.32, -s - 0.08, 0.9), (0.08, 0.08, 0.12), M["warm"], g, outline=0.012, bevel=0)
    box("swin", (s + 0.02, -0.3, 0.6), (0.04, 0.4, 0.36), M["glass"], g, outline=0.014, bevel=0)
    # a hanging sign on an iron arm at the corner
    if sign is not None:
        box("signarm", (s + o + 0.25, -s - o - 0.02, 1.55), (0.5, 0.03, 0.03), M["iron"], g, outline=0.008, bevel=0)
        box("sign", (s + o + 0.38, -s - o - 0.02, 1.34), (0.04, 0.36, 0.3), toon(f"sign{sign}", sign, dark=0.75), g, outline=0.014, bevel=0)
        ball("signmark", (s + o + 0.41, -s - o - 0.02, 1.34), (0.02, 0.1, 0.1), M["gold"], g, outline=0, seg=10)
    # ivy and a barrel by the wall
    for i in range(rnd.randint(1, 3)):
        ball("ivy", (s + 0.05, s - 0.2 - i * 0.18, 0.2 + rnd.random() * 0.2), (0.12, 0.16, 0.2), M["leaf2"], g, outline=0.016, seg=12)


# ---- the fountain (2 x 2) --------------------------------------------------------------------
def fountain():
    M = mats()
    S = toon("fstone", 0xD8D0C2, dark=0.74)
    S2 = toon("fstone2", 0xBDB4A4, dark=0.74)
    WATER = toon("fwater", 0x5FB8E8, dark=0.8, light=1.25)
    FOAM = flat("foam", 0xEAF8FF)
    BRONZE = toon("bronze", 0x5FA88E, dark=0.62, light=1.3)
    for k in range(16):
        a = k * math.tau / 16
        box("rim", (1.05 * math.cos(a), 1.05 * math.sin(a), 0.22), (0.24, 0.44, 0.42), S if k % 2 else S2, outline=0.018, rot=(0, 0, a), bevel=0.04)
    cone("pool", (0, 0, 0.3), 0.98, 0.98, 0.04, WATER, outline=0, seg=32, bevel=0)
    for k in range(10):
        a = k * math.tau / 10 + 0.2
        ball("ripple", (0.75 * math.cos(a), 0.75 * math.sin(a), 0.33), (0.12, 0.05, 0.01), FOAM, outline=0, rot=(0, 0, a), seg=10)
    cone("pedestal", (0, 0, 0.62), 0.24, 0.16, 0.8, S, seg=16)
    cone("bowl", (0, 0, 1.06), 0.22, 0.62, 0.18, S2, seg=24)
    cone("bowlwater", (0, 0, 1.16), 0.56, 0.56, 0.02, WATER, outline=0, seg=24, bevel=0)
    # sheets of water falling from the bowl
    for k in range(12):
        a = k * math.tau / 12
        cone("fall", (0.64 * math.cos(a), 0.64 * math.sin(a), 0.72), 0.035, 0.05, 0.72, toon("fall", 0x9ADCFF, dark=0.9, light=1.2), outline=0, seg=6, bevel=0)
    # a bronze maiden pouring water from a jar
    cone("plinth", (0, 0, 1.3), 0.18, 0.2, 0.22, S, outline=0.016, seg=12)
    cone("robe", (0, 0, 1.7), 0.2, 0.09, 0.62, BRONZE, outline=0.018, seg=16)
    ball("head", (0, 0, 2.1), 0.11, BRONZE, outline=0.016, seg=14)
    ball("hair", (0, 0.04, 2.13), (0.11, 0.1, 0.1), BRONZE, outline=0.012, seg=12)
    arm = pivot("arm", (0.1, 0, 1.9))
    arm.rotation_euler = (0, rad(-120), 0)
    cone("arm", (0, 0, 0.13), 0.04, 0.035, 0.26, BRONZE, arm, outline=0.012, seg=8)
    cone("jar", (0.28, 0, 2.14), 0.08, 0.05, 0.16, BRONZE, outline=0.014, rot=(0, rad(-60), 0), seg=12)
    for i in range(5):
        ball("pour", (0.36 + i * 0.05, 0, 2.06 - i * 0.18), (0.035, 0.035, 0.1), toon("fall", 0x9ADCFF, dark=0.9, light=1.2), outline=0, seg=8)


# ---- city wall pieces (one tile each) --------------------------------------------------------------
def wall(dirs):
    g = tile_space()
    S = toon("cwall", 0xCFC6B4, dark=0.72)
    S2 = toon("cwall2", 0xB9B09E, dark=0.72)
    cone("core", (0, 0, 0.85), 0.32, 0.32, 1.7, S, g, seg=4, rot=(0, 0, rad(45)), bevel=0.02)
    for d in dirs:
        dx, dy = {"x": (1, 0), "X": (-1, 0), "y": (0, -1), "Y": (0, 1)}[d]
        L = T / 2 + 0.02
        box("seg", (dx * L / 2, dy * L / 2, 0.85), (L if dx else 0.46, L if dy else 0.46, 1.7), S, g, outline=0.02, bevel=0.02)
        for k in range(2):
            t = (k + 0.5) / 2 * L
            box("crenel", (dx * t, dy * t, 1.8), (0.17, 0.17, 0.2), S2, g, outline=0.014, bevel=0.01)
        for k in range(3):
            t = (k + 0.3) / 3 * L
            box("mortar", (dx * t + (0.235 if dy else 0), dy * t - (0.235 if dx else 0), 0.4 + 0.45 * k), (0.2 if dx else 0.02, 0.02 if dx else 0.2, 0.02), toon("cmortar", 0x9F9786), g, outline=0, bevel=0)
    box("cap", (0, 0, 1.8), (0.2, 0.2, 0.2), S2, g, outline=0.014, bevel=0.01)


def walltower():
    M = mats()
    S = toon("cwall", 0xCFC6B4, dark=0.72)
    cone("tower", (0, 0, 1.25), 0.56, 0.5, 2.5, S, seg=16, bevel=0.02)
    for k in range(8):
        a = k * math.tau / 8
        box("crenel", (0.52 * math.cos(a), 0.52 * math.sin(a), 2.6), (0.18, 0.18, 0.22), S, outline=0.014, rot=(0, 0, a), bevel=0.01)
    cone("roof", (0, 0, 3.2), 0.62, 0.0, 1.0, M["slate"], seg=16, bevel=0)
    flag(M, (0, 0, 3.6), h=0.6, s=0.7)
    box("slit", (0, -0.5, 1.5), (0.1, 0.05, 0.36), M["dark"], outline=0, bevel=0)


# ---- street things (one tile each) ----------------------------------------------------------------
def lamp(lit):
    M = mats()
    cone("foot", (0, 0, 0.1), 0.17, 0.13, 0.2, M["iron"], seg=8)
    cone("post", (0, 0, 0.85), 0.05, 0.045, 1.4, M["iron"], outline=0.016, seg=8)
    box("arm", (0.14, 0, 1.52), (0.32, 0.04, 0.04), M["iron"], outline=0.01, bevel=0)
    cone("cage", (0.28, 0, 1.36), 0.11, 0.13, 0.26, M["warm"] if lit else toon("coldglass", 0x8E98A8), outline=0.018, seg=4, rot=(0, 0, rad(45)), bevel=0)
    cone("hood", (0.28, 0, 1.53), 0.16, 0.03, 0.12, M["iron"], outline=0.014, seg=4, rot=(0, 0, rad(45)), bevel=0)
    ball("hoodknob", (0.28, 0, 1.6), 0.03, M["iron"], outline=0.008, seg=8)
    if lit:
        ball("glow", (0.28, 0, 1.36), 0.09, flat("lampcore", 0xFFF4C0), outline=0, seg=12)


def barrel(n):
    W = toon("barrel", 0x9A6334)
    I = toon("bhoop", 0x4E4A52, dark=0.6, light=1.35)
    spots = ((0, 0),) if n == 1 else ((-0.2, 0.12), (0.2, 0.08), (0.0, -0.22))
    for x, y in spots:
        cone("barrel", (x, y, 0.3), 0.21, 0.21, 0.58, W, seg=16)
        for z in (0.1, 0.5):
            ring("hoop", (x, y, z), 0.215, 0.02, I, outline=0.01)
        cone("lid", (x, y, 0.6), 0.19, 0.19, 0.02, toon("barrelt", 0xB27A45), outline=0, seg=16, bevel=0)


def crate(fruit):
    W = toon("crate", 0xB5834A)
    W2 = toon("crate2", 0x93683A)
    for x, y, z in ((-0.18, 0.1, 0.17), (0.2, 0.0, 0.17), (0.0, 0.08, 0.5)):
        box("crate", (x, y, z), (0.38, 0.38, 0.32), W, bevel=0.01)
        for zz in (-0.08, 0.08):
            box("slat", (x, y - 0.195, z + zz), (0.38, 0.01, 0.04), W2, outline=0, bevel=0)
    c = (0xE8483C, 0xFF9A2E, 0x6CC472, 0xB86AE0)[fruit]
    F = toon(f"fruit{c}", c, dark=0.75)
    for i in range(7):
        a = i * math.tau / 7
        ball("fruit", (0.0 + 0.1 * math.cos(a), 0.08 + 0.1 * math.sin(a), 0.7), 0.065, F, outline=0.012, seg=12)
    ball("fruit", (0, 0.08, 0.76), 0.065, F, outline=0.012, seg=12)


def sacks():
    C = toon("sack", 0xC9A46A)
    for x, y, s in ((-0.16, 0.08, 1.0), (0.18, 0.02, 0.9), (0.0, -0.16, 0.8)):
        ball("sack", (x, y, 0.22 * s), (0.2 * s, 0.18 * s, 0.24 * s), C, outline=0.018, seg=14)
        cone("neck", (x, y, 0.47 * s), 0.08 * s, 0.05 * s, 0.1 * s, C, outline=0.012, seg=10)
    ball("grain", (0.0, -0.16, 0.45), (0.12, 0.12, 0.03), toon("grain", 0xF0D27A), outline=0, seg=10)


def bench():
    g = tile_space()
    W = toon("bench", 0x9A6334)
    I = toon("ciron", 0x3E3B44, dark=0.6, light=1.4)
    for x in (-0.36, 0.36):
        box("leg", (x, 0, 0.18), (0.06, 0.34, 0.36), I, g, outline=0.012, bevel=0)
    for k in range(3):
        box("plank", (0, -0.12 + k * 0.12, 0.38), (0.9, 0.1, 0.05), W, g, outline=0.012, bevel=0.01)
    box("back", (0, 0.18, 0.62), (0.9, 0.05, 0.3), W, g, outline=0.012, bevel=0.01)


def planter(seed):
    S = toon("planter", 0xB9AE9C, dark=0.74)
    rnd = random.Random(seed)
    box("planter", (0, 0, 0.2), (0.62, 0.62, 0.4), S, bevel=0.03)
    box("soil", (0, 0, 0.41), (0.54, 0.54, 0.04), toon("soil", 0x5A3E2A), outline=0, bevel=0)
    ball("leaves", (0, 0, 0.55), (0.32, 0.32, 0.22), toon("pleaf", 0x5CAE4E, dark=0.7), outline=0.02, seg=14)
    for i in range(8):
        a = rnd.random() * math.tau
        c = (0xFF5A7A, 0xFFE14D, 0xFFFFFF, 0xC06AFF)[(i + seed) % 4]
        ball("bloom", (0.24 * math.cos(a), 0.24 * math.sin(a), 0.62 + rnd.random() * 0.1), 0.06, toon(f"bloom{c}", c, dark=0.8), outline=0.01, seg=10)


def banner(color):
    M = mats()
    cone("pole", (0, 0, 1.1), 0.04, 0.035, 2.2, M["iron"], outline=0.012, seg=8)
    ball("finial", (0, 0, 2.24), 0.06, M["gold"], outline=0.012, seg=10)
    box("bar", (0, 0, 2.05), (0.6, 0.04, 0.04), M["iron"], outline=0.01, bevel=0)
    F = toon(f"ban{color}", color, dark=0.72)
    box("cloth", (0, -0.03, 1.6), (0.56, 0.02, 0.9), F, outline=0.014, bevel=0)
    cone("tail", (0, -0.03, 1.08), 0.28, 0.0, 0.16, F, outline=0.012, seg=3, rot=(rad(180), 0, 0), scale=(1, 0.1, 1), bevel=0)
    ball("emblem", (0, -0.05, 1.68), (0.14, 0.02, 0.14), M["gold"], outline=0.01, seg=12)


def goldtree(variant):
    leaf = (0xE7B53A, 0xE08A32, 0xC9C24A)[variant]
    L1 = toon(f"gleaf{variant}", leaf, dark=0.7)
    L2 = toon(f"gleafl{variant}", tuple(min(1, c * 1.3 + 0.03) for c in srgb(leaf)), dark=0.75)
    BARK = toon("bark", 0x84532D)
    rnd = random.Random(variant * 5 + 1)
    cone("trunk", (0, 0, 0.5), 0.19, 0.12, 1.0, BARK)
    ball("crown", (0, 0, 1.45), (0.62, 0.6, 0.58), L1, outline=0.035)
    for i in range(9):
        a = i * math.tau / 9 + rnd.random() * 0.4
        r = 0.45 + rnd.random() * 0.08
        s = 0.27 + rnd.random() * 0.07
        ball("blob", (r * math.cos(a), r * math.sin(a), 1.25 + rnd.random() * 0.25), (s, s, s * 0.9), L1, outline=0.03, seg=18)
    for x, y, z, s in ((-0.16, -0.22, 1.82, 0.27), (0.2, -0.14, 1.74, 0.24), (-0.02, 0.1, 1.96, 0.25)):
        ball("light", (x, y, z), (s, s, s * 0.85), L2, outline=0.026, seg=18)
    for i in range(5):  # a few leaves already on the ground
        a = rnd.random() * math.tau
        ball("fallen", (0.5 * math.cos(a), 0.5 * math.sin(a), 0.01), (0.06, 0.04, 0.01), L1, outline=0, seg=8)


def pigeon(fly):
    g = pivot("big", (0, 0, 0))
    g.scale = (1.7, 1.7, 1.7)
    B = toon("pigeon", 0x9AA0AE, dark=0.7)
    N = toon("pneck", 0x6F9A8E, dark=0.7)
    ball("body", (0, 0, 0.12), (0.1, 0.14, 0.08), B, outline=0.012, parent=g, seg=12)
    ball("head", (0, -0.13, 0.2), 0.05, N, outline=0.01, parent=g, seg=10)
    cone("beak", (0, -0.18, 0.2), 0.015, 0.0, 0.04, toon("beak", 0xE0A040), outline=0, parent=g, rot=(rad(90), 0, 0), seg=6, bevel=0)
    for s in (-1, 1):
        if fly:
            box("wing", (0.14 * s, 0, 0.18), (0.2, 0.1, 0.02), B, outline=0.01, parent=g, rot=(0, rad(-25 * s), 0), bevel=0)
        else:
            ball("wing", (0.07 * s, 0.02, 0.14), (0.04, 0.1, 0.05), toon("pwing", 0x7F8594), outline=0.008, parent=g, seg=8)


ITEMS = {
    "castle": castle,
    "clocktower": clocktower,
    "fountain": fountain,
    "town0": lambda: townhouse(1, 0xC8573A, 0xF4E6C8, shop=0xC8453A, sign=0x3F7FB5),
    "town1": lambda: townhouse(2, 0x3F6FA5, 0xF6EBD6, sign=0xC8453A),
    "town2": lambda: townhouse(3, 0xD98A2E, 0xEFDDBE, shop=0x3F8F5A),
    "town3": lambda: townhouse(4, 0x8A4A3A, 0xF2E2C6, shop=0x2F6FB0, sign=0xE8B83A),
    "town4": lambda: townhouse(5, 0xB8452E, 0xE9D7B8, tall=1),
    "town5": lambda: townhouse(6, 0x4F7A5A, 0xF6EBD6, shop=0xD9484F, tall=1),
    "wall-x": lambda: wall("xX"),
    "wall-y": lambda: wall("yY"),
    "wall-c0": lambda: wall("xy"),
    "wall-c1": lambda: wall("Xy"),
    "wall-c2": lambda: wall("xY"),
    "wall-c3": lambda: wall("XY"),
    "wall-ex": lambda: wall("x"),
    "wall-eX": lambda: wall("X"),
    "wall-ey": lambda: wall("y"),
    "wall-eY": lambda: wall("Y"),
    "walltower": walltower,
    "lamp0": lambda: lamp(False),
    "lamp1": lambda: lamp(True),
    "barrel0": lambda: barrel(1),
    "barrel1": lambda: barrel(3),
    "crate0": lambda: crate(0),
    "crate1": lambda: crate(1),
    "crate2": lambda: crate(2),
    "crate3": lambda: crate(3),
    "sacks": sacks,
    "bench": bench,
    "planter0": lambda: planter(1),
    "planter1": lambda: planter(2),
    "banner0": lambda: banner(0xC8453A),
    "banner1": lambda: banner(0x3F6FB5),
    "gold0": lambda: goldtree(0),
    "gold1": lambda: goldtree(1),
    "gold2": lambda: goldtree(2),
    "pigeon0": lambda: pigeon(False),
    "pigeon1": lambda: pigeon(True),
}

# canvas (width, height, look) for things too big for the usual 400 x 440
SIZES = {
    "castle": (1300, 1360, 4.6),
    "clocktower": (400, 820, 4.0),
    "town0": (420, 600, 2.3),
    "town1": (420, 600, 2.3),
    "town2": (420, 600, 2.3),
    "town3": (420, 600, 2.3),
    "town4": (420, 600, 2.3),
    "town5": (420, 600, 2.3),
    "walltower": (400, 520, 2.0),
}

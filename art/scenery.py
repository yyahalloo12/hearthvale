"""Everything that stands still: houses, trees, rocks, stations, ground details.

blender --background --factory-startup --python art/scenery.py -- <out dir>
Writes one atlas, scenery.png + scenery.json. Each frame's anchor is the centre
of its tile on the ground, so the game can put it exactly on the grid.
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
OUT = args[0]
only = args[1:]
rad = math.radians

PX = 80  # pixels per unit; the game shows the atlas at half size
W, H = 400, 440
VIEW = H / PX
LOOK = 1.35
T = 64 / 40 / math.sqrt(2)  # one tile in units
ANCHOR = (W / 2, H / 2 + LOOK * math.cos(rad(30)) * PX)


def tile_space():
    """Local x = the tile grid's x axis, local -y = the grid's y axis."""
    p = pivot("grid", (0, 0, 0))
    p.rotation_euler.z = rad(-45)
    return p


def mesh(name, verts, faces, mat, parent=None, outline=0.03):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return kit._finish(ob, name, mat, parent, False, outline)


# ---- buildings --------------------------------------------------------------------
def house(roof_color, seed):
    g = tile_space()
    rnd = random.Random(seed)
    WALL = toon(f"wall{seed}", (0xF6E7C4, 0xF3DDC0, 0xEFE6D2)[seed % 3], dark=0.78)
    BEAM = toon("beam", 0x7A4A2A)
    STONE = toon("stone", 0xA8A198)
    ROOF = toon(f"roof{seed}", roof_color, dark=0.7)
    ROOF2 = toon(f"roofb{seed}", tuple(c * 0.82 for c in srgb(roof_color)), dark=0.72)
    s = 1.0  # half side
    box("base", (0, 0, 0.11), (2.14, 2.14, 0.24), STONE, g, bevel=0.04)
    box("wall", (0, 0, 0.66), (2 * s, 2 * s, 0.92), WALL, g, bevel=0.02)
    for x in (-s, s):
        for y in (-s, s):
            box("post", (x, y, 0.66), (0.13, 0.13, 0.95), BEAM, g, outline=0.022, bevel=0.02)
    for z in (0.26, 1.08):
        box("railx", (0, -s - 0.01, z), (2 * s, 0.08, 0.1), BEAM, g, outline=0.02, bevel=0.015)
        box("raily", (s + 0.01, 0, z), (0.08, 2 * s, 0.1), BEAM, g, outline=0.02, bevel=0.015)
    for x, a in ((-0.72, 32), (0.74, -32)):
        box("brace", (x, -s - 0.01, 0.68), (0.07, 0.06, 0.86), BEAM, g, outline=0.018, rot=(0, rad(a), 0), bevel=0.01)
    # gable: ridge runs along x, so the triangle end faces right
    top, ridge, over = 1.1, 2.06, 0.22
    mesh("gable", [(s, -s, top), (s, s, top), (s, 0, ridge - 0.12)], [(0, 1, 2)], WALL, g, outline=0)
    box("kingpost", (s + 0.01, 0, 1.5), (0.07, 0.09, 0.8), BEAM, g, outline=0.018, bevel=0.01)
    slope = math.atan2(ridge - top, s)
    length = math.hypot(ridge - top, s) + over
    for side in (-1, 1):
        for i in range(7):  # rows of shingles, from the eaves up
            d = (i + 0.5) / 7 * length
            y = side * (length - d) * math.cos(slope)
            z = ridge - (length - d) * math.sin(slope) + 0.05 + 0.012 * (6 - i) * 0
            box("shingles", (0, y, z), (2 * s + 0.42, length / 7 + 0.07, 0.075), ROOF if i % 2 else ROOF2, g, outline=0.02, rot=(rad(-6) * side - slope * side, 0, 0), bevel=0.02)
    cone("ridge", (0, 0, ridge + 0.08), 0.085, 0.085, 2 * s + 0.48, ROOF2, g, rot=(0, rad(90), 0), bevel=0.02)
    # chimney
    box("chimney", (-0.45, 0.42, 2.02), (0.32, 0.32, 0.72), STONE, g, bevel=0.03)
    box("chimneytop", (-0.45, 0.42, 2.4), (0.4, 0.4, 0.1), STONE, g, bevel=0.02)
    # door on the left face, window on the right face
    DOOR = toon("door", 0x8A4F2C)
    box("doorframe", (0.0, -s - 0.02, 0.56), (0.56, 0.1, 0.84), BEAM, g, outline=0.022)
    box("door", (0.0, -s - 0.06, 0.53), (0.42, 0.08, 0.72), DOOR, g, outline=0.012)
    ball("knob", (0.13, -s - 0.12, 0.52), 0.035, toon("gold", 0xF2B82E, dark=0.7), g, outline=0.01)
    box("step", (0.0, -s - 0.2, 0.06), (0.62, 0.26, 0.12), STONE, g, outline=0.02)
    GLASS = toon("glass", 0x9ADBFF, dark=0.85)
    for yy in (-0.0,):
        box("winframe", (s + 0.03, yy, 0.72), (0.1, 0.62, 0.52), BEAM, g, outline=0.02)
        box("glass", (s + 0.07, yy, 0.72), (0.06, 0.5, 0.4), GLASS, g, outline=0)
        box("bar1", (s + 0.11, yy, 0.72), (0.03, 0.05, 0.42), BEAM, g, outline=0)
        box("bar2", (s + 0.11, yy, 0.72), (0.03, 0.5, 0.05), BEAM, g, outline=0)
        box("flowerbox", (s + 0.15, yy, 0.42), (0.16, 0.62, 0.12), DOOR, g, outline=0.018)
        for i in range(6):
            c = (0xFF6FA8, 0xFFE14D, 0xFFFFFF)[i % 3]
            ball("bloom", (s + 0.17, yy - 0.26 + i * 0.104, 0.52 + 0.03 * (i % 2)), 0.06, toon(f"bloom{c}", c, dark=0.8), g, outline=0.014, seg=12)
    box("attic", (s + 0.03, 0.0, 1.45), (0.05, 0.24, 0.24), GLASS, g, outline=0.018, rot=(0, 0, 0))
    for i in range(3):  # a few bushes at the corner
        ball("ivy", (s + 0.05, s - 0.08 - i * 0.16, 0.2 + rnd.random() * 0.06), (0.14, 0.15, 0.17), toon("leafa", 0x4FAE55), g, outline=0.022, seg=16)


def well():
    g = tile_space()
    STONE = toon("stone", 0xA8A198)
    WOOD = toon("wood", 0x8A5A32)
    ROOF = toon("roofw", 0xC8453A, dark=0.7)
    for ring_i in range(2):
        for i in range(10):
            a = (i + ring_i * 0.5) * math.pi / 5
            box("block", (0.42 * math.cos(a), 0.42 * math.sin(a), 0.13 + 0.22 * ring_i), (0.17, 0.27, 0.21), STONE, g, outline=0.02, rot=(0, 0, a), bevel=0.04)
    cone("water", (0, 0, 0.3), 0.36, 0.36, 0.02, flat("wellwater", 0x3F86C0), g, outline=0, bevel=0)
    for x in (-0.46, 0.46):
        box("post", (x, 0, 0.78), (0.09, 0.09, 0.9), WOOD, g, outline=0.022)
    cone("axle", (0, 0, 0.95), 0.05, 0.05, 0.9, WOOD, g, outline=0.02, rot=(0, rad(90), 0))
    ring("rope", (0.05, 0, 0.95), 0.06, 0.03, toon("rope", 0xD9B77E), g, outline=0.01, rot=(0, rad(90), 0))
    cone("bucket", (0.05, 0, 0.62), 0.1, 0.13, 0.2, WOOD, g, outline=0.02)
    for side in (-1, 1):
        box("roof", (0, 0.24 * side, 1.4), (1.2, 0.62, 0.07), ROOF, g, rot=(rad(-36) * side, 0, 0))
    cone("ridge", (0, 0, 1.6), 0.06, 0.06, 1.24, ROOF, g, outline=0.02, rot=(0, rad(90), 0))


def fence(dirs):
    g = tile_space()
    WOOD = toon("fence", 0xB07A45)
    POST = toon("fencepost", 0x8F5E33)
    cone("post", (0, 0, 0.32), 0.08, 0.075, 0.66, POST, g, outline=0.022)
    ball("cap", (0, 0, 0.66), (0.1, 0.1, 0.06), POST, g, outline=0.018, seg=16)
    for d in dirs:
        dx, dy = {"x": (1, 0), "X": (-1, 0), "y": (0, -1), "Y": (0, 1)}[d]
        for z in (0.24, 0.46):
            box("rail", (dx * T / 4, dy * T / 4, z), (T / 2 + 0.06 if dx else 0.06, T / 2 + 0.06 if dy else 0.06, 0.1), WOOD, g, outline=0.02, bevel=0.02)


# ---- plants and rocks -----------------------------------------------------------------
def oak(variant):
    leaf = (0x46A552, 0x5CB84E, 0x3C9A5E)[variant]
    L1 = toon(f"leaf{variant}", leaf, dark=0.7)
    L2 = toon(f"leafl{variant}", tuple(min(1, c * 1.35 + 0.02) for c in srgb(leaf)), dark=0.75)
    BARK = toon("bark", 0x84532D)
    rnd = random.Random(variant * 7 + 3)
    cone("trunk", (0, 0, 0.42), 0.2, 0.13, 0.86, BARK)
    for i in range(5):
        a = i * 2 * math.pi / 5 + variant
        ball("root", (0.17 * math.cos(a), 0.17 * math.sin(a), 0.05), (0.13, 0.13, 0.09), BARK, outline=0.024, seg=16)
    ball("crown", (0, 0, 1.3), (0.62, 0.6, 0.55), L1, outline=0.035)
    blobs = []
    for i in range(8):
        a = i * 2 * math.pi / 8 + rnd.random() * 0.4
        r = 0.44 + rnd.random() * 0.08
        blobs.append((r * math.cos(a), r * math.sin(a), 1.12 + rnd.random() * 0.2, 0.28 + rnd.random() * 0.07))
    for x, y, z, s in blobs:
        ball("blob", (x, y, z), (s, s, s * 0.9), L1, outline=0.03, seg=20)
    for x, y, z, s in ((-0.16, -0.22, 1.66, 0.28), (0.2, -0.14, 1.58, 0.25), (-0.02, 0.1, 1.82, 0.26), (-0.36, -0.36, 1.36, 0.17)):
        ball("light", (x, y, z), (s, s, s * 0.85), L2, outline=0.026, seg=20)
    if variant != 1:
        for i in range(6):
            a = rad(-150 + i * 24)
            ball("apple", (0.66 * math.cos(a), 0.66 * math.sin(a), 1.0 + 0.3 * rnd.random()), 0.07, toon("apple", 0xE8483C if variant == 0 else 0xFFC23A, dark=0.75), outline=0.018, seg=14)


def deadtree(variant):
    B = toon("deadbark", 0x6A6474)
    cone("trunk", (0, 0, 0.5), 0.17, 0.09, 1.0, B)
    for i in range(4):
        a = i * math.pi / 2 + variant
        cone("root", (0.16 * math.cos(a), 0.16 * math.sin(a), 0.06), 0.07, 0.02, 0.26, B, outline=0.022, rot=(0, rad(62), a), bevel=0)
    specs = ((34, 20, 0.62, 0.72), (-38, 200, 0.55, 0.86), (26, 120, 0.5, 0.95), (-30, 300, 0.6, 0.62), (8, 60, 0.6, 1.1))
    for k, (tilt, az, length, z) in enumerate(specs):
        if variant and k == 1:
            continue
        p = pivot("b", (0, 0, z))
        p.rotation_euler = (rad(abs(tilt)), 0, rad(az + variant * 70))
        cone("branch", (0, 0, length / 2), 0.065, 0.025, length, B, p, outline=0.022, bevel=0)
        q = pivot("t", (0, 0, length * 0.62), p)
        q.rotation_euler = (rad(44), 0, rad(50))
        cone("twig", (0, 0, 0.16), 0.035, 0.012, 0.34, B, q, outline=0.018, bevel=0)
    # one lost thread of colour
    box("thread", (0.1, -0.16, 0.66), (0.018, 0.015, 0.4), toon("thr", (0xC14A6A, 0x4A90D9)[variant], dark=0.85), outline=0, rot=(0, rad(8), 0), bevel=0)


def bush(flowers):
    L = toon("bush", 0x4AA85A, dark=0.72)
    L2 = toon("bushl", 0x6CC472, dark=0.78)
    for x, y, z, s in ((-0.24, 0.02, 0.22, 0.26), (0.24, 0.04, 0.22, 0.25), (0, -0.12, 0.2, 0.26), (0, 0.16, 0.3, 0.28)):
        ball("b", (x, y, z), (s, s, s * 0.88), L, outline=0.028, seg=20)
    for x, y, z, s in ((-0.1, -0.08, 0.42, 0.17), (0.16, 0.0, 0.42, 0.15)):
        ball("l", (x, y, z), s, L2, outline=0.022, seg=18)
    for i, (x, y, z) in enumerate(((-0.26, -0.2, 0.28), (0.02, -0.36, 0.26), (0.28, -0.18, 0.28), (-0.06, -0.2, 0.5), (0.2, -0.12, 0.5))):
        ball("berry", (x, y, z), 0.05, toon(f"berry{flowers}", flowers, dark=0.8), outline=0.014, seg=12)


def rock(body, gem, seed):
    R = toon(f"rock{body}", body, dark=0.66)
    G = toon(f"gem{gem}", gem, dark=0.72, light=1.3)
    rnd = random.Random(seed)

    def chunk(x, y, z, s):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
        ob = bpy.context.object
        for v in ob.data.vertices:
            v.co *= 0.88 + rnd.random() * 0.2
        ob.scale = (s, s * 0.9, s * 0.72)
        ob.rotation_euler.z = rnd.random() * 6
        apply(ob)
        ob.location = (x, y, z)
        kit._finish(ob, "chunk", R, None, False, 0.028)

    chunk(0, 0.04, 0.24, 0.38)
    chunk(-0.27, -0.1, 0.13, 0.22)
    chunk(0.28, -0.04, 0.15, 0.24)
    for x, y, z, tilt, az, s in ((0.06, -0.24, 0.36, 40, 180, 1.0), (-0.16, -0.16, 0.4, 24, 130, 0.8), (0.22, -0.16, 0.34, 46, 230, 0.75)):
        p = pivot("c", (x, y, z))
        p.rotation_euler = (rad(tilt), 0, rad(az - 180))
        cone("crystal", (0, 0, 0.08), 0.075 * s, 0.0, 0.26 * s, G, p, outline=0.018, seg=5, bevel=0)


def ruin(variant):
    g = tile_space()
    S = toon("ruin", 0x67616F)
    S2 = toon("ruin2", 0x7B7484)
    rnd = random.Random(variant + 11)
    heights = ((1.25, 0.8, 0.55), (0.6, 1.0, 1.4))[variant]
    for i, h in enumerate(heights):
        n = max(1, int(h / 0.24))
        for k in range(n):
            box("block", (-0.34 + 0.34 * i + rnd.uniform(-0.015, 0.015), rnd.uniform(-0.02, 0.02), 0.12 + 0.24 * k), (0.34, 0.42, 0.24), S if (i + k) % 2 else S2, g, outline=0.022, bevel=0.035)
    for x, y in ((-0.3, -0.42), (0.36, -0.36)):
        box("fallen", (x, y, 0.09), (0.24, 0.2, 0.17), S2, g, outline=0.02, rot=(rad(8), rad(6), rad(rnd.random() * 90)), bevel=0.04)


# ---- things to use ------------------------------------------------------------------------
def anvil():
    g = tile_space()
    WOOD = toon("stump", 0x94602F)
    IRON = toon("iron", 0x656A78, dark=0.6, light=1.35)
    cone("stump", (0, 0, 0.16), 0.36, 0.32, 0.32, WOOD, g)
    ring("hoop", (0, 0, 0.2), 0.345, 0.025, IRON, g, outline=0.014)
    box("foot", (0, 0, 0.37), (0.46, 0.26, 0.1), IRON, g, outline=0.022)
    box("waist", (0, 0, 0.47), (0.26, 0.17, 0.14), IRON, g, outline=0.022)
    box("face", (0, 0, 0.6), (0.62, 0.28, 0.16), IRON, g, outline=0.025)
    cone("horn", (0.44, 0, 0.61), 0.1, 0.0, 0.3, IRON, g, outline=0.022, rot=(0, rad(90), 0), bevel=0)
    box("hot", (-0.06, -0.02, 0.695), (0.3, 0.08, 0.035), flat("hot", 0xFF9A2E), g, outline=0.012, rot=(0, 0, rad(18)), bevel=0)
    h = pivot("hammer", (-0.42, -0.36, 0.08), g)
    h.rotation_euler = (rad(64), rad(10), rad(30))
    cone("handle", (0, 0, 0.16), 0.03, 0.03, 0.42, WOOD, h, outline=0.018, bevel=0)
    box("head", (0, 0, 0.38), (0.25, 0.13, 0.13), IRON, h, outline=0.02)
    # a barrel of swords
    cone("barrel", (-0.42, 0.34, 0.26), 0.2, 0.2, 0.5, WOOD, g)
    for z in (0.12, 0.4):
        ring("bhoop", (-0.42, 0.34, z), 0.205, 0.022, IRON, g, outline=0.012)
    for dx, t in ((-0.06, -12), (0.07, 14)):
        p = pivot("sw", (-0.42 + dx, 0.34, 0.5), g)
        p.rotation_euler = (0, rad(t), 0)
        cone("hilt", (0, 0, 0.16), 0.025, 0.025, 0.2, toon("grip", 0x5A3B22), p, outline=0.014, bevel=0)
        box("guard", (0, 0, 0.08), (0.2, 0.05, 0.04), toon("gold", 0xF2B82E, dark=0.7), p, outline=0.014, bevel=0.01)


def chest():
    g = tile_space()
    WOOD = toon("chest", 0xA66A38)
    GOLD = toon("gold", 0xF2B82E, dark=0.7)
    box("box", (0, 0, 0.22), (0.78, 0.56, 0.42), WOOD, g)
    cone("lid", (0, 0, 0.44), 0.28, 0.28, 0.78, WOOD, g, rot=(0, rad(90), 0), scale=(1, 1, 0.85))
    for x in (-0.3, 0.3):
        box("band", (x, 0, 0.22), (0.09, 0.6, 0.44), GOLD, g, outline=0.016, bevel=0.015)
        ring("lidband", (x, 0, 0.44), 0.272, 0.045, GOLD, g, outline=0.014, rot=(0, rad(90), 0), scale=(1, 1, 0.88))
    box("rim", (0, 0, 0.44), (0.82, 0.6, 0.06), GOLD, g, outline=0.016, bevel=0.015)
    box("lock", (0, -0.3, 0.4), (0.16, 0.07, 0.2), GOLD, g, outline=0.016)
    ball("keyhole", (0, -0.342, 0.41), (0.028, 0.012, 0.04), flat("eye", 0x2B1A10), g, outline=0)


def portal():
    S = toon("arch", 0x8B8494)
    S2 = toon("arch2", 0xA29BAC)
    for side in (-1, 1):
        for k in range(5):
            box("pillar", (0.56 * side, 0, 0.15 + 0.27 * k), (0.3, 0.34, 0.27), S if k % 2 else S2, outline=0.024, bevel=0.04)
    for i in range(7):
        a = rad(12 + i * 26)
        box("arch", (0.56 * math.cos(a), 0, 1.42 + 0.46 * math.sin(a)), (0.28, 0.34, 0.26), S2 if i % 2 else S, outline=0.024, rot=(0, -a + rad(90), 0), bevel=0.04)
    for r, c, y in ((0.5, 0x3A1F52, 0.06), (0.4, 0x6A2F9A, 0.02), (0.29, 0xA04FE0, -0.02), (0.17, 0xE0A8FF, -0.06), (0.07, 0xFFFFFF, -0.09)):
        ball("swirl", (0.02 * (0.5 - r), y, 0.96), (r * 0.92, 0.01, r * 1.62), flat(f"swirl{c}", c), outline=0)
    for i in range(3):
        cone("rune", (-0.56, -0.18, 0.4 + i * 0.36), 0.05, 0.05, 0.01, flat("rune", 0xE0A8FF), outline=0, rot=(rad(90), 0, 0), seg=(3, 4, 6)[i], bevel=0)
    box("stepstone", (0, -0.22, 0.04), (1.3, 0.5, 0.09), S, outline=0.022)


def gate():
    G = toon("gategold", 0xF2B82E, dark=0.72)
    for side in (-1, 1):
        cone("post", (0.42 * side, 0, 0.62), 0.075, 0.06, 1.24, G, outline=0.024)
        ball("orb", (0.42 * side, 0, 1.3), 0.11, toon("orb", 0xFFF3B0, dark=0.85), outline=0.022)
        cone("foot", (0.42 * side, 0, 0.06), 0.15, 0.1, 0.12, G, outline=0.022)
    for i in range(9):
        a = rad(i * 22.5)
        ball("arc", (0.42 * math.cos(a), 0, 1.36 + 0.36 * math.sin(a)), 0.055, G, outline=0.018, seg=14)
    for r, c, y in ((0.36, 0xFFE9A0, 0.04), (0.26, 0xFFF6D0, 0.0), (0.14, 0xFFFFFF, -0.04)):
        ball("light", (0, y, 0.82), (r, 0.01, r * 1.95), flat(f"gl{c}", c), outline=0)


def bundle():
    C = toon("cloth", 0xB98350)
    R = toon("ribbon", 0xC8453A)
    ball("sack", (0, 0, 0.26), (0.36, 0.33, 0.28), C)
    cone("neck", (0, 0, 0.54), 0.2, 0.1, 0.16, C, outline=0.024)
    ring("tie", (0, 0, 0.54), 0.13, 0.04, R, outline=0.016)
    for i in range(7):
        a = i * 2 * math.pi / 7
        cone("frill", (0.1 * math.cos(a), 0.1 * math.sin(a), 0.66), 0.03, 0.1, 0.18, C, outline=0.018, rot=(rad(22) * -math.sin(a), rad(22) * math.cos(a), 0), bevel=0.02)
    for s in (-1, 1):
        ball("bow", (0.15 * s, -0.14, 0.55), (0.12, 0.05, 0.08), R, outline=0.018, rot=(0, rad(18 * s), 0), seg=16)
    cone("sword", (0.2, 0.1, 0.62), 0.035, 0.03, 0.42, toon("iron", 0x656A78, dark=0.6, light=1.35), outline=0.016, rot=(0, rad(24), 0), bevel=0)
    for x, y in ((-0.34, -0.26), (-0.2, -0.38), (0.3, -0.32)):
        cone("coin", (x, y, 0.03), 0.075, 0.075, 0.035, toon("gold", 0xF2B82E, dark=0.7), outline=0.014, bevel=0.01)


# ---- ground details (flat, lie inside one tile) ------------------------------------------------
def spots(seed, n, reach=0.4):
    rnd = random.Random(seed)
    return [(rnd.uniform(-reach, reach) * T, rnd.uniform(-reach, reach) * T, rnd) for _ in range(n)]


def tuft(seed):
    g = tile_space()
    for i, (x, y, rnd) in enumerate(spots(seed, 4, 0.36)):
        c = toon("grassa", 0x5DAF49, dark=0.8) if i % 2 else toon("grassb", 0x97DC72, dark=0.85)
        for k in range(4):
            cone("blade", (x + 0.03 * k - 0.05, y + 0.02 * (k % 2), 0.08), 0.022, 0.0, 0.14 + rnd.random() * 0.07, c, g, outline=0, rot=(rad(rnd.uniform(-22, 22)), rad(-24 + 16 * k), 0), bevel=0, seg=8)


def flowers(seed):
    g = tile_space()
    for i, (x, y, rnd) in enumerate(spots(seed, 4, 0.36)):
        c = (0xFF6FA8, 0xFFFFFF, 0xFFE14D, 0xB48CF0)[(i + seed) % 4]
        cone("stem", (x, y, 0.06), 0.014, 0.014, 0.12, toon("grassa", 0x5DAF49, dark=0.8), g, outline=0, bevel=0, seg=8)
        for k in range(5):
            a = k * 2 * math.pi / 5
            ball("petal", (x + 0.05 * math.cos(a), y + 0.05 * math.sin(a), 0.13), (0.042, 0.042, 0.024), toon(f"petal{c}", c, dark=0.85), g, outline=0.008, seg=10)
        ball("heart", (x, y, 0.145), (0.03, 0.03, 0.022), toon("heart", 0xF2B82E), g, outline=0, seg=10)


def pebbles(seed, color):
    g = tile_space()
    for i, (x, y, rnd) in enumerate(spots(seed, 5, 0.38)):
        s = 0.035 + rnd.random() * 0.04
        ball("pebble", (x, y, 0.01), (s * 1.3, s, s * 0.6), toon(f"peb{color}{i % 2}", tuple(c * (1 - 0.12 * (i % 2)) for c in srgb(color)), dark=0.8), g, outline=0.01, seg=12)


def slabs(seed, color, gap=0.035, n=3):
    """Paving stones that fill the tile and leave the same gap at its edges."""
    g = tile_space()
    rnd = random.Random(seed)
    step = T / n
    for i in range(n):
        shift = 0
        for k in range(n):
            f = 1 - 0.09 * rnd.random() - 0.05 * ((i + k) % 2)
            m = toon(f"slab{color}{seed}{i}{k}", tuple(c * f for c in srgb(color)), dark=0.86, light=1.08)
            box("slab", ((i - (n - 1) / 2) * step + shift, (k - (n - 1) / 2) * step, 0), (step - gap, step - gap, 0.05), m, g, outline=0, bevel=0.02)


def lily(seed):
    g = tile_space()
    for i, (x, y, rnd) in enumerate(spots(seed, 3, 0.3)):
        cone("pad", (x, y, 0.01), 0.14, 0.13, 0.02, toon("pad", 0x5FB35A, dark=0.8), g, outline=0.012, bevel=0)
    x, y, _ = spots(seed, 3, 0.3)[0]
    for k in range(6):
        a = k * math.pi / 3
        cone("petal", (x + 0.05 * math.cos(a), y + 0.05 * math.sin(a), 0.07), 0.035, 0.0, 0.12, toon("lilyp", 0xFFB8D8, dark=0.85), g, outline=0.01, rot=(rad(26) * -math.sin(a), rad(26) * math.cos(a), 0), bevel=0, seg=10)


def shells(seed):
    g = tile_space()
    for i, (x, y, rnd) in enumerate(spots(seed, 3, 0.34)):
        c = (0xFFD9C0, 0xFFB8A0, 0xFFF6E6)[i]
        cone("shell", (x, y, 0.03), 0.06, 0.0, 0.1, toon(f"shell{c}", c, dark=0.8), g, outline=0.01, rot=(rad(74), 0, rad(rnd.random() * 360)), bevel=0, seg=10)


def crack(seed):
    g = tile_space()
    D = flat("crack", 0x57525F)
    rnd = random.Random(seed)
    x, y, a = -0.3 * T, rnd.uniform(-0.2, 0.2) * T, rnd.uniform(-0.4, 0.4)
    for i in range(5):
        ln = 0.14 + rnd.random() * 0.06
        box("c", (x + ln / 2 * math.cos(a), y + ln / 2 * math.sin(a), 0), (ln, 0.02, 0.005), D, g, outline=0, rot=(0, 0, a), bevel=0)
        x += ln * math.cos(a)
        y += ln * math.sin(a)
        a += rnd.uniform(-0.8, 0.8)


ITEMS = {
    "house0": lambda: house(0xC8453A, 0),
    "house1": lambda: house(0x3F7FB5, 1),
    "house2": lambda: house(0xD98A2E, 2),
    "well": well,
    "fence-x": lambda: fence("xX"),
    "fence-y": lambda: fence("yY"),
    "fence-c0": lambda: fence("xy"),
    "fence-c1": lambda: fence("Xy"),
    "fence-c2": lambda: fence("xY"),
    "fence-c3": lambda: fence("XY"),
    "fence-ex": lambda: fence("x"),
    "fence-eX": lambda: fence("X"),
    "fence-ey": lambda: fence("y"),
    "fence-eY": lambda: fence("Y"),
    "tree0": lambda: oak(0),
    "tree1": lambda: oak(1),
    "tree2": lambda: oak(2),
    "dead0": lambda: deadtree(0),
    "dead1": lambda: deadtree(1),
    "bush0": lambda: bush(0xFFFFFF),
    "bush1": lambda: bush(0xE8483C),
    "rock-ore_1": lambda: rock(0x9A948C, 0xE8894A, 1),
    "rock-ore_2": lambda: rock(0x868C96, 0xCFE0F2, 2),
    "rock-ore_3": lambda: rock(0x6F6878, 0xC39BFF, 3),
    "ruin0": lambda: ruin(0),
    "ruin1": lambda: ruin(1),
    "anvil": anvil,
    "chest": chest,
    "portal": portal,
    "gate": gate,
    "bundle": bundle,
    "g-tuft0": lambda: tuft(1),
    "g-tuft1": lambda: tuft(2),
    "g-tuft2": lambda: tuft(3),
    "g-flower0": lambda: flowers(4),
    "g-flower1": lambda: flowers(5),
    "g-flower2": lambda: flowers(6),
    "g-pebble0": lambda: pebbles(7, 0xB8955C),
    "g-pebble1": lambda: pebbles(8, 0xA08050),
    "g-plaza0": lambda: slabs(1, 0xCFC8BC),
    "g-plaza1": lambda: slabs(2, 0xCFC8BC),
    "g-pale0": lambda: slabs(3, 0x8C8698, n=2),
    "g-pale1": lambda: slabs(4, 0x8C8698, n=2),
    "g-crack0": lambda: crack(5),
    "g-crack1": lambda: crack(9),
    "g-lily": lambda: lily(3),
    "g-shell": lambda: shells(4),
}

frames = []
for name, build in ITEMS.items():
    if only and not any(name.startswith(o) for o in only):
        continue
    reset()
    kit._mats.clear()
    stage(W, H, VIEW, LOOK)
    build()
    a = render_array()
    ys, xs = np.where(a[..., 3] > 0.01)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    if x0 == 0 or y0 == 0 or x1 == W or y1 == H:
        print("WARNING cut off:", name)
    frames.append((name, a[y0:y1, x0:x1], (ANCHOR[0] - x0, ANCHOR[1] - y0)))

# pack: rows of similar height
frames.sort(key=lambda f: -f[1].shape[0])
SHEET_W, pad = 1600, 4
x = y = row_h = 0
atlas = {}
place = []
for name, img, (ax, ay) in frames:
    h, w = img.shape[:2]
    if x + w + pad > SHEET_W:
        x, y, row_h = 0, y + row_h + pad, 0
    place.append((x, y, img))
    atlas[name] = {
        "frame": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
        "rotated": False,
        "trimmed": False,
        "sourceSize": {"w": int(w), "h": int(h)},
        "spriteSourceSize": {"x": 0, "y": 0, "w": int(w), "h": int(h)},
        "anchor": {"x": round(float(ax / w), 4), "y": round(float(ay / h), 4)},
    }
    x += w + pad
    row_h = max(row_h, h)
sheet = np.zeros((y + row_h, SHEET_W, 4), dtype=np.float32)
for x, y, img in place:
    sheet[y : y + img.shape[0], x : x + img.shape[1]] = img
os.makedirs(OUT, exist_ok=True)
save_sheet([[sheet]], os.path.join(OUT, "scenery.png"))
with open(os.path.join(OUT, "scenery.json"), "w") as f:
    json.dump({"frames": atlas, "meta": {"image": "scenery.png", "scale": 1}}, f, indent=1)
print("frames", len(frames))

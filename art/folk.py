"""Townsfolk of Aldermere: people who walk the streets, sell at the market and
keep the shops. Same body and camera as the player, so they stand the same size.

blender --background --factory-startup --python art/folk.py -- <out dir> [names...]
Writes folk-<name>.png: 8 rows (facings), 8 columns (2 idle, 6 walk).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import kit  # noqa: E402
from kit import ball, box, cone, flat, pivot, render_array, reset, ring, save_sheet, stage, toon  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(args[0])
ONLY = args[1:]
W, H = 128, 144
rad = math.radians

FOLK = {
    # name: skin, hair, style, top, bottom, skirt, apron, hat, beard, belly
    "man": dict(skin=0xFFD3A8, hair=0x6A3A1E, style="short", top=0x8A5A3A, bottom=0x4A5A7A, dress=None, apron=None, hat=("cap", 0x5A6A3A), beard=None, belly=False, shirt=0xF2E6CC),
    "woman": dict(skin=0xFFDDB8, hair=0xB8642E, style="bun", top=0x3F7FB5, bottom=None, dress=0x3F7FB5, apron=0xFFF6E6, hat=("scarf", 0xE8483C), beard=None, belly=False, shirt=0xFFF6E6),
    "noble": dict(skin=0xFFE2C8, hair=0xF2D27A, style="long", top=0xA8324A, bottom=None, dress=0xA8324A, apron=None, hat=("tiara", 0xF2B82E), beard=None, belly=False, shirt=0xF6E2B0),
    "elder": dict(skin=0xF2C8A0, hair=0xECECEC, style="bald", top=0x7A7A8A, bottom=None, dress=0x6A6A7A, apron=None, hat=None, beard=0xF4F4F4, belly=False, shirt=0x8A8A9A),
    "smith": dict(skin=0xE8B48A, hair=0x2E2620, style="bald", top=0xC8B8A0, bottom=0x4A3A30, dress=None, apron=0x5A3A22, hat=None, beard=0x2E2620, belly=True, shirt=0xC8B8A0),
    "merchant": dict(skin=0xFFD3A8, hair=0x3A2A1A, style="short", top=0x3F8F5A, bottom=0x6A4A2A, dress=None, apron=None, hat=("feather", 0x7A3A8A), beard=0x3A2A1A, belly=True, shirt=0xF2E6CC),
    "kid": dict(skin=0xFFDDB8, hair=0xD8642A, style="short", top=0x6CC472, bottom=0x7A5A3A, dress=None, apron=None, hat=None, beard=None, belly=False, shirt=0x6CC472),
    "girl": dict(skin=0xFFE2C8, hair=0x5A3A22, style="long", top=0xF29AB8, bottom=None, dress=0xF29AB8, apron=0xFFFFFF, hat=None, beard=None, belly=False, shirt=0xFFFFFF),
    "baker": dict(skin=0xFFD3A8, hair=0xC8A060, style="short", top=0xF6F0E6, bottom=0x6A6A7A, dress=None, apron=0xFFFFFF, hat=("chef", 0xFFFFFF), beard=None, belly=True, shirt=0xF6F0E6),
    "scholar": dict(skin=0xF6D2B0, hair=0x2A2A3A, style="short", top=0x2F4F8A, bottom=None, dress=0x2F4F8A, apron=None, hat=("hood", 0x2F4F8A), beard=None, belly=False, shirt=0x2F4F8A),
}


def build(v):
    reset()
    kit._mats.clear()
    stage(W, H, 2.42, 0.8)
    SKIN = toon("skin", v["skin"], dark=0.8, light=1.05)
    HAIR = toon("hair", v["hair"])
    TOP = toon("top", v["top"], dark=0.66, light=1.1)
    SHIRT = toon("shirt", v["shirt"], dark=0.7)
    BOOT = toon("boot", 0x6B4226)
    BELT = toon("belt", 0x4A2C17)
    EYE = flat("eye", 0x2B1A10)
    SHINE = flat("shine", 0xFFFFFF)
    BLUSH = flat("blush", 0xFF9C8C)
    MOUTH = flat("mouth", 0x9A4A3A)
    root = pivot("root", (0, 0, 0))
    body = pivot("body", (0, 0, 0), root)
    legs, arms = [], []
    LEG = toon("legs", v["bottom"] or 0x5A4A40)
    for side in (-1, 1):
        hip = pivot(f"hip{side}", (0.13 * side, 0, 0.4), body)
        cone("leg", (0, 0, -0.14), 0.1, 0.115, 0.3, LEG, hip)
        cone("boot", (0, 0, -0.29), 0.115, 0.125, 0.18, BOOT, hip)
        ball("toe", (0, -0.07, -0.335), (0.11, 0.16, 0.07), BOOT, hip)
        legs.append(hip)
    chest = pivot("chest", (0, 0, 0.36), body)
    wide = 1.18 if v["belly"] else 1.0
    if v["dress"]:
        D = toon("dress", v["dress"], dark=0.66, light=1.1)
        cone("skirt", (0, 0, -0.06), 0.4, 0.26, 0.56, D, chest, scale=(1, 0.88, 1))
        cone("torso", (0, 0, 0.3), 0.25, 0.19, 0.32, D, chest, scale=(1, 0.86, 1))
    else:
        cone("skirt", (0, 0, 0.08), 0.31 * wide, 0.26 * wide, 0.26, TOP, chest, scale=(1, 0.86, 1))
        cone("torso", (0, 0, 0.3), 0.27 * wide, 0.2, 0.32, TOP, chest, scale=(1, 0.86, 1))
        ring("belt", (0, 0, 0.19), 0.262 * wide, 0.035, BELT, chest, scale=(1, 0.88, 1.2))
    if v["belly"]:
        ball("belly", (0, -0.1, 0.22), (0.27, 0.22, 0.2), TOP if not v["dress"] else D, chest, outline=0.026)
    if v["apron"]:
        A = toon("apron", v["apron"], dark=0.75)
        box("apron", (0, -0.25 * wide - 0.02, 0.12 if not v["dress"] else 0.02), (0.36, 0.04, 0.5), A, chest, outline=0.02, rot=(rad(-6), 0, 0), bevel=0.02)
        box("bib", (0, -0.23 * wide, 0.36), (0.26, 0.04, 0.2), A, chest, outline=0.018, bevel=0.02)
    ring("collar", (0, 0, 0.47), 0.17, 0.05, SHIRT, chest, outline=0.02)
    for side in (-1, 1):
        sh = pivot(f"shoulder{side}", (0.21 * side * wide, 0, 0.4), chest)
        holder = pivot(f"arm{side}", (0, 0, 0), sh)
        holder.rotation_euler = (0, rad(-22 * side), 0)
        cone("sleeve", (0, 0, -0.12), 0.105, 0.08, 0.26, SHIRT if v["apron"] and not v["dress"] else (D if v["dress"] else TOP), holder)
        ball("hand", (0, 0, -0.31), 0.088, SKIN, holder)
        arms.append(sh)
    head = pivot("head", (0, 0, 0.84), body)
    ball("face", (0, 0, 0.36), (0.45, 0.42, 0.4), SKIN, head, outline=0.035)
    for side in (-1, 1):
        ball("ear", (0.43 * side, 0.02, 0.32), (0.07, 0.06, 0.09), SKIN, head, outline=0.025)
        ball("eye", (0.165 * side, -0.39, 0.31), (0.07, 0.045, 0.1), EYE, head, outline=0, rot=(0, 0, rad(20 * side)))
        ball("shine", (0.165 * side - 0.02, -0.436, 0.35), (0.025, 0.016, 0.032), SHINE, head, outline=0)
        ball("blush", (0.265 * side, -0.35, 0.215), (0.06, 0.025, 0.033), BLUSH, head, outline=0, rot=(0, 0, rad(36 * side)))
        box("brow", (0.165 * side, -0.385, 0.445), (0.1, 0.03, 0.022), HAIR, head, outline=0, rot=(0, rad(10 * side), rad(20 * side)), bevel=0.01)
    ball("mouth", (0, -0.418, 0.195), (0.045, 0.02, 0.018), MOUTH, head, outline=0)
    st = v["style"]
    covered = v["hat"] and v["hat"][0] in ("cap", "scarf", "hood")
    if st != "bald" and not covered:
        ball("hair", (0, 0.1, 0.47), (0.475, 0.43, 0.37), HAIR, head, outline=0.035)
        for x, y, z, sx, sy, sz in ((-0.24, -0.27, 0.66, 0.2, 0.14, 0.12), (0.0, -0.31, 0.7, 0.22, 0.14, 0.11), (0.22, -0.27, 0.67, 0.2, 0.14, 0.12)):
            ball("lock", (x, y, z), (sx, sy, sz), HAIR, head, outline=0.03)
    else:
        ball("fringe", (0, 0.2, 0.3), (0.46, 0.3, 0.2), HAIR, head, outline=0.03)
    if st == "long":
        for s in (-1, 1):
            ball("long", (0.36 * s, 0.12, 0.12), (0.15, 0.17, 0.36), HAIR, head, outline=0.03)
        ball("back", (0, 0.32, 0.12), (0.36, 0.16, 0.38), HAIR, head, outline=0.03)
    if st == "bun":
        ball("bun", (0, 0.32, 0.72), 0.16, HAIR, head, outline=0.03)
    if v["beard"]:
        B = toon("beard", v["beard"])
        ball("beard", (0, -0.3, 0.06), (0.3, 0.18, 0.26), B, head, outline=0.028)
        ball("stache", (0, -0.42, 0.2), (0.17, 0.05, 0.05), B, head, outline=0.02)
    hat = v["hat"]
    if hat:
        kind, c = hat
        Hm = toon("hat", c, dark=0.68)
        if kind == "cap":
            ball("cap", (0, 0.04, 0.62), (0.46, 0.44, 0.26), Hm, head, outline=0.03)
            box("brim", (0, -0.36, 0.56), (0.4, 0.22, 0.04), Hm, head, outline=0.02, rot=(rad(-12), 0, 0))
        elif kind == "scarf":
            ball("scarf", (0, 0.06, 0.55), (0.5, 0.47, 0.34), Hm, head, outline=0.03)
            ball("knot", (0, 0.42, 0.42), (0.12, 0.1, 0.1), Hm, head, outline=0.02)
        elif kind == "tiara":
            ring("tiara", (0, 0.0, 0.7), 0.24, 0.03, Hm, head, outline=0.014)
            for k in range(3):
                cone("point", (-0.1 + 0.1 * k, -0.23, 0.78), 0.035, 0.0, 0.1, Hm, head, outline=0.01, bevel=0)
        elif kind == "feather":
            cone("hat", (0, 0.04, 0.72), 0.5, 0.3, 0.16, Hm, head, outline=0.028)
            cone("crown", (0, 0.04, 0.84), 0.3, 0.26, 0.18, Hm, head, outline=0.026)
            box("feather", (0.24, 0.1, 1.02), (0.05, 0.08, 0.42), toon("feath", 0xF2D27A), head, outline=0.016, rot=(0, rad(-25), 0))
        elif kind == "chef":
            cone("chef", (0, 0.04, 0.76), 0.33, 0.36, 0.3, Hm, head, outline=0.026)
            ball("puff", (0, 0.04, 0.98), (0.4, 0.38, 0.2), Hm, head, outline=0.026)
        elif kind == "hood":
            ball("hood", (0, 0.1, 0.48), (0.53, 0.5, 0.45), Hm, head, outline=0.032)
            ball("face_open", (0, -0.24, 0.36), (0.36, 0.2, 0.32), SKIN, head, outline=0)
    return root, body, chest, head, legs, arms


def pose(parts, kind, t):
    root, body, chest, head, legs, arms = parts
    a = t * 2 * math.pi
    body.location = (0, 0, 0)
    body.rotation_euler = (0, 0, 0)
    head.rotation_euler = (0, 0, 0)
    for o in legs + arms:
        o.rotation_euler = (0, 0, 0)
    if kind == "idle":
        chest.location.z = 0.36 + 0.012 * math.sin(a)
        head.location.z = 0.84 + 0.018 * math.sin(a)
        return
    chest.location.z = 0.36
    head.location.z = 0.84
    s = math.sin(a)
    legs[0].rotation_euler.x = rad(34) * s
    legs[1].rotation_euler.x = -rad(34) * s
    arms[0].rotation_euler.x = -rad(30) * s
    arms[1].rotation_euler.x = rad(30) * s
    body.location.z = 0.04 * abs(math.cos(a))
    body.rotation_euler.x = rad(4)


FRAMES = [("idle", 0.25), ("idle", 0.75)] + [("walk", i / 6) for i in range(6)]
os.makedirs(OUT, exist_ok=True)
for name, v in FOLK.items():
    if ONLY and name not in ONLY:
        continue
    parts = build(v)
    turn = pivot("turn", (0, 0, 0))
    parts[0].parent = turn
    rows = []
    for f in range(8):
        turn.rotation_euler.z = -rad(45) * f
        row = []
        for kind, t in FRAMES:
            pose(parts, kind, t)
            row.append(render_array())
        rows.append(row)
    save_sheet(rows, os.path.join(OUT, f"folk-{name}.png"))
    print("folk", name)

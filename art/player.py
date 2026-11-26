"""The player: a thread-binder with a golden scarf and a spool on the belt.

blender --background --factory-startup --python art/player.py -- <out dir> [preview | hero]

"hero" renders the big picture for the inventory (8 turns, one standing pose,
one sheet per layer: hero-<layer>.png) and a close-up of the face for the
HUD (portrait-<layer>.png). The game puts the layers together and tints them.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from kit import *  # noqa: E402,F403

args = sys.argv[sys.argv.index("--") + 1:]
OUT = os.path.abspath(args[0])
PREVIEW = "preview" in args
HERO = "hero" in args
W, H = 128, 144

reset()
stage(W, H, 2.42, 0.8)

SKIN = toon("skin", 0xFFD3A8, dark=0.8, light=1.05)
HAIR = toon("hair", 0x7A4426)
TUNIC = toon("tunic", 0x4A90D9 if PREVIEW else 0xF2F2F2, dark=0.66, light=1.1)
PANTS = toon("pants", 0x5B4A66)
BOOT = toon("boot", 0x6B4226)
BELT = toon("belt", 0x4A2C17)
GOLD = toon("gold", 0xF2B82E, dark=0.7)
SCARF = toon("scarf", 0xE8A020, dark=0.7)
CUFF = toon("cuff", 0xF6ECD2, dark=0.75)
EYE = flat("eye", 0x2B1A10)
SHINE = flat("shine", 0xFFFFFF)
BLUSH = flat("blush", 0xFF9C8C)
MOUTH = flat("mouth", 0x9A4A3A)
METAL = toon("metal", 0xD88A4E if PREVIEW else 0xF0F0F0, dark=0.6, light=1.12)
WOOD = toon("wood", 0x8A5A32)
GRIP = toon("grip", 0x5A3B22)

root = pivot("root", (0, 0, 0))
body = pivot("body", (0, 0, 0), root)
groups = {"base": [], "hair": [], "tunic": [], "helm": [], "sword": [], "axe": [], "bow": [], "staff": [], "cap": [], "hat": [], "cloak": []}


def put(group, ob):
    groups[group].append(ob)
    return ob


# ---- legs -------------------------------------------------------------------
legs = []
for side in (-1, 1):
    hip = pivot(f"hip{side}", (0.145 * side, 0, 0.4), body)
    put("base", cone("leg", (0, 0, -0.14), 0.11, 0.125, 0.3, PANTS, hip))
    put("base", cone("boot", (0, 0, -0.29), 0.125, 0.135, 0.18, BOOT, hip))
    put("base", ball("toe", (0, -0.07, -0.335), (0.12, 0.17, 0.075), BOOT, hip))
    put("base", ring("bootcuff", (0, 0, -0.2), 0.125, 0.028, CUFF, hip))
    legs.append(hip)

# ---- torso --------------------------------------------------------------------
chest = pivot("chest", (0, 0, 0.36), body)
put("tunic", cone("skirt", (0, 0, 0.08), 0.335, 0.255, 0.26, TUNIC, chest, scale=(1, 0.86, 1)))
put("tunic", cone("torso", (0, 0, 0.3), 0.265, 0.2, 0.32, TUNIC, chest, scale=(1, 0.86, 1)))
put("base", ring("belt", (0, 0, 0.19), 0.262, 0.04, BELT, chest, scale=(1, 0.88, 1.2)))
put("base", box("buckle", (0, -0.255, 0.19), (0.1, 0.05, 0.09), GOLD, chest, outline=0.015, bevel=0.015))
# the spool of fate thread
spool = pivot("spool", (0.25, -0.12, 0.12), chest)
put("base", cone("spool_thread", (0, 0, 0), 0.065, 0.065, 0.1, GOLD, spool, outline=0.018))
for z in (-0.06, 0.06):
    put("base", cone("spool_end", (0, 0, z), 0.08, 0.08, 0.03, WOOD, spool, outline=0.018, bevel=0.01))

# scarf with a tail that flies behind
put("base", ring("scarf", (0, 0, 0.47), 0.2, 0.075, SCARF, chest, outline=0.025, scale=(1, 0.95, 0.9)))
tail = pivot("tail", (0.07, 0.2, 0.45), chest)
put("base", box("tail1", (0, 0.06, -0.1), (0.17, 0.05, 0.3), SCARF, tail, outline=0.025, rot=(math.radians(28), 0, 0)))
put("base", box("tail2", (0.02, 0.17, -0.28), (0.14, 0.045, 0.2), SCARF, tail, outline=0.025, rot=(math.radians(34), 0, 0)))

# ---- arms -----------------------------------------------------------------------
arms = []
for side in (-1, 1):
    sh = pivot(f"shoulder{side}", (0.22 * side, 0, 0.4), chest)
    tilt = math.radians(-24 * side)
    holder = pivot(f"arm{side}", (0, 0, 0), sh)
    holder.rotation_euler = (0, tilt, 0)
    put("tunic", cone("sleeve", (0, 0, -0.12), 0.115, 0.085, 0.26, TUNIC, holder))
    put("base", ring("cuff", (0, 0, -0.245), 0.095, 0.03, CUFF, holder))
    put("base", ball("hand", (0, 0, -0.325), 0.092, SKIN, holder))
    if side == 1:
        put("base", ring("thread", (0, 0, -0.275), 0.085, 0.016, GOLD, holder, outline=0))
    arms.append(sh)
# the weapon hand is the character's right hand (screen left when facing us)
hand = pivot("grip_at", (0, -0.02, -0.33), bpy.data.objects["arm-1"])

# ---- head -------------------------------------------------------------------------
head = pivot("head", (0, 0, 0.84), body)
put("base", ball("face", (0, 0, 0.36), (0.45, 0.42, 0.4), SKIN, head, outline=0.035))
for side in (-1, 1):
    put("base", ball("ear", (0.43 * side, 0.02, 0.32), (0.07, 0.06, 0.09), SKIN, head, outline=0.025))
    put("base", ball("eye", (0.165 * side, -0.39, 0.31), (0.072, 0.045, 0.108), EYE, head, outline=0, rot=(0, 0, math.radians(20 * side))))
    put("base", ball("shine", (0.165 * side - 0.02, -0.436, 0.352), (0.026, 0.016, 0.034), SHINE, head, outline=0))
    put("base", ball("blush", (0.265 * side, -0.35, 0.215), (0.062, 0.025, 0.034), BLUSH, head, outline=0, rot=(0, 0, math.radians(36 * side))))
    put("base", box("brow", (0.165 * side, -0.385, 0.445), (0.1, 0.03, 0.022), HAIR, head, outline=0, rot=(0, math.radians(10 * side), math.radians(20 * side)), bevel=0.01))
put("base", ball("mouth", (0, -0.418, 0.195), (0.045, 0.02, 0.018), MOUTH, head, outline=0))
# hair: a cap pushed back, plus chunky locks
put("hair", ball("hair", (0, 0.1, 0.47), (0.475, 0.43, 0.37), HAIR, head, outline=0.035))
for x, y, z, sx, sy, sz, ry in (
    (-0.27, -0.25, 0.66, 0.2, 0.15, 0.12, 26),
    (-0.05, -0.31, 0.71, 0.2, 0.14, 0.11, 10),
    (0.19, -0.28, 0.68, 0.21, 0.15, 0.12, -22),
    (0.37, -0.12, 0.46, 0.12, 0.17, 0.2, -8),
    (-0.38, -0.12, 0.46, 0.12, 0.17, 0.2, 8),
    (0.0, 0.38, 0.3, 0.3, 0.14, 0.24, 0),
    (0.24, 0.3, 0.24, 0.15, 0.14, 0.16, 12),
    (-0.24, 0.3, 0.24, 0.15, 0.14, 0.16, -12),
):
    put("hair", ball("lock", (x, y, z), (sx, sy, sz), HAIR, head, outline=0.03, rot=(0, math.radians(ry), 0)))

# ---- helmet -----------------------------------------------------------------------
put("helm", ball("helm", (0, 0.06, 0.52), (0.51, 0.48, 0.42), METAL, head, outline=0.035))
put("helm", ring("helmrim", (0, 0.05, 0.53), 0.485, 0.05, METAL, head, outline=0.025, scale=(1.03, 0.97, 1)))
put("helm", box("crest", (0, 0.1, 0.92), (0.07, 0.42, 0.1), METAL, head, outline=0.03, bevel=0.04))
put("helm", box("nose", (0, -0.44, 0.44), (0.07, 0.05, 0.18), METAL, head, outline=0.02, bevel=0.02))

# ---- soft cap, pointed hat and a cloak (only in the big inventory picture) ----------------
put("cap", ball("cap", (0, 0.05, 0.6), (0.49, 0.47, 0.3), METAL, head, outline=0.032))
put("cap", box("brim", (0, -0.4, 0.55), (0.42, 0.24, 0.045), METAL, head, outline=0.02, rot=(math.radians(-14), 0, 0)))
put("cap", ball("pompom", (0, 0.12, 0.88), 0.08, METAL, head, outline=0.016))
put("hat", cone("hatbrim", (0, 0.04, 0.6), 0.66, 0.6, 0.05, METAL, head, outline=0.028, bevel=0.01))
hatpiv = pivot("hattip", (0, 0.06, 0.62), head)
hatpiv.rotation_euler = (math.radians(-14), 0, 0)
put("hat", cone("hatcone", (0, 0, 0.42), 0.4, 0.04, 0.84, METAL, hatpiv, outline=0.03, bevel=0.01))
put("hat", ring("hatband", (0, 0.04, 0.66), 0.39, 0.035, GOLD, head, outline=0.012))
cloak = pivot("cloakpiv", (0, 0.2, 0.47), chest)
put("cloak", box("cloakback", (0, 0.06, -0.33), (0.58, 0.06, 0.78), METAL, cloak, outline=0.026, rot=(math.radians(10), 0, 0), bevel=0.02))
put("cloak", ball("cloakcollar", (0, -0.02, 0.02), (0.3, 0.2, 0.08), METAL, cloak, outline=0.02))

# ---- weapons ------------------------------------------------------------------------
sword = pivot("sword", (0, 0, 0), hand)
put("sword", box("blade", (0, 0, 0.46), (0.15, 0.05, 0.62), METAL, sword, outline=0.028, bevel=0.015))
put("sword", cone("tip", (0, 0, 0.83), 0.1, 0.0, 0.16, METAL, sword, outline=0.028, scale=(1, 0.4, 1), seg=4, rot=(0, 0, math.radians(45)), bevel=0))
put("sword", box("guard", (0, 0, 0.14), (0.3, 0.08, 0.065), METAL, sword, outline=0.025, bevel=0.02))
put("sword", cone("handle", (0, 0, 0.02), 0.035, 0.035, 0.2, METAL, sword, outline=0.02))
put("sword", ball("pommel", (0, 0, -0.1), 0.05, METAL, sword, outline=0.02))
axe = pivot("axe", (0, 0, 0), hand)
put("axe", cone("shaft", (0, 0, 0.3), 0.038, 0.034, 0.95, METAL, axe, outline=0.022))
put("axe", cone("edge", (-0.17, 0, 0.64), 0.21, 0.07, 0.24, METAL, axe, outline=0.028, rot=(0, math.radians(90), 0), scale=(1, 0.3, 1), bevel=0.01))
put("axe", box("back", (0.1, 0, 0.64), (0.14, 0.09, 0.13), METAL, axe, outline=0.025, bevel=0.02))
for w in (sword, axe):
    w.rotation_euler = (math.radians(28), math.radians(-38), 0)


bow = pivot("bow", (0, 0, 0), hand)
for i in range(9):
    a = math.radians(-80 + i * 20)
    b = math.radians(-80 + (i + 1) * 20)
    if i == 8:
        break
    x0, z0 = -0.2 + 0.3 * math.cos(a), 0.46 * math.sin(a)
    x1, z1 = -0.2 + 0.3 * math.cos(b), 0.46 * math.sin(b)
    put("bow", cone("limb", ((x0 + x1) / 2, 0, (z0 + z1) / 2), 0.034, 0.034, math.hypot(x1 - x0, z1 - z0) + 0.03, METAL, bow, outline=0.022, rot=(0, math.atan2(x1 - x0, z1 - z0), 0), bevel=0))
put("bow", cone("string", (-0.148, 0, 0), 0.008, 0.008, 0.9, flat("string", 0xF6ECD2), bow, outline=0, bevel=0))
put("bow", ball("gripball", (0.1, 0, 0), (0.05, 0.05, 0.1), METAL, bow, outline=0.02))
staff = pivot("staff", (0, 0, 0), hand)
put("staff", cone("shaft", (0, 0, 0.16), 0.036, 0.034, 1.25, METAL, staff, outline=0.022))
put("staff", ring("crook", (0, 0, 0.88), 0.13, 0.035, METAL, staff, outline=0.02, rot=(math.radians(90), 0, 0)))
put("staff", ball("orb", (0, 0, 0.88), 0.085, toon("orb", 0x8FD3FF, dark=0.8, light=1.2), staff, outline=0.016))
bow.rotation_euler = (math.radians(20), math.radians(-10), math.radians(30))
staff.rotation_euler = (math.radians(14), math.radians(-12), 0)


# ---- poses --------------------------------------------------------------------------
def pose(kind, t):
    """t goes 0..1 through the animation."""
    root.rotation_euler.x = 0
    root.rotation_euler.y = 0
    root.location = (0, 0, 0)
    body.location = (0, 0, 0)
    body.rotation_euler = (0, 0, 0)
    chest.rotation_euler = (0, 0, 0)
    head.rotation_euler = (0, 0, 0)
    for o in legs + arms:
        o.rotation_euler = (0, 0, 0)
    tail.rotation_euler = (0, 0, 0)
    hand.rotation_euler = (0, 0, 0)
    a = t * 2 * math.pi
    if kind == "idle":
        chest.location.z = 0.36 + 0.012 * math.sin(a)
        head.location.z = 0.84 + 0.018 * math.sin(a)
        tail.rotation_euler.x = math.radians(6 * math.sin(a))
        return
    chest.location.z = 0.36
    head.location.z = 0.84
    if kind == "walk":
        s = math.sin(a)
        legs[0].rotation_euler.x = math.radians(38) * s
        legs[1].rotation_euler.x = -math.radians(38) * s
        arms[0].rotation_euler.x = -math.radians(34) * s
        arms[1].rotation_euler.x = math.radians(34) * s
        body.location.z = 0.05 * abs(math.cos(a))
        body.rotation_euler.x = math.radians(5)
        head.rotation_euler.y = math.radians(3) * s
        tail.rotation_euler.x = math.radians(24 + 10 * math.sin(a * 2))
    elif kind == "attack":
        # wind up, strike, follow through, recover
        lift, lean, twist = ((-150, -6, 14), (-95, 4, 0), (-28, 16, -20), (-10, 6, -8))[round(t * 4) % 4]
        arms[0].rotation_euler.x = math.radians(lift)
        arms[0].rotation_euler.y = math.radians(-8)
        arms[1].rotation_euler.x = math.radians(24)
        body.rotation_euler.x = math.radians(lean)
        chest.rotation_euler.z = math.radians(twist)
        legs[0].rotation_euler.x = math.radians(16)
        legs[1].rotation_euler.x = math.radians(-18)
        hand.rotation_euler.x = math.radians((10, -10, -30, -20)[round(t * 4) % 4])
        tail.rotation_euler.x = math.radians(20)
    elif kind == "dead":
        root.rotation_euler.x = math.radians(-88)
        root.location = (0, -0.62, 0.3)
        arms[0].rotation_euler.y = math.radians(50)
        arms[1].rotation_euler.y = math.radians(-50)
        legs[0].rotation_euler.y = math.radians(12)
        legs[1].rotation_euler.y = math.radians(-12)


turn = pivot("turn", (0, 0, 0))
root.parent = turn

FRAMES = [("idle", 0.25), ("idle", 0.75)] + [("walk", i / 6) for i in range(6)] + [("attack", i / 4) for i in range(4)] + [("dead", 0)]
LAYERS = {
    "base": (("base", "hair", "tunic"), ()),
    "tunic": (("tunic",), ("base", "hair")),
    "helm": (("helm",), ("base", "tunic")),
    "sword": (("sword",), ("base", "hair", "tunic")),
    "axe": (("axe",), ("base", "hair", "tunic")),
    "bow": (("bow",), ("base", "hair", "tunic")),
    "staff": (("staff",), ("base", "hair", "tunic")),
}

os.makedirs(OUT, exist_ok=True)
HERO_LAYERS = {
    "base": (("base", "hair", "tunic"), ()),
    "tunic": (("tunic",), ("base", "hair", "cloak")),
    "helm": (("helm",), ("base", "tunic")),
    "cap": (("cap",), ("base", "tunic")),
    "hat": (("hat",), ("base", "tunic")),
    "cloak": (("cloak",), ("base", "hair", "tunic")),
    "sword": (("sword",), ("base", "hair", "tunic", "cloak")),
    "axe": (("axe",), ("base", "hair", "tunic", "cloak")),
    "bow": (("bow",), ("base", "hair", "tunic", "cloak")),
    "staff": (("staff",), ("base", "hair", "tunic", "cloak")),
}
if HERO:
    sc = bpy.context.scene
    cam = sc.camera

    def aim(width, height, view, look, tilt=30):
        """A camera only a little above the ground, so the hero stands tall."""
        e = math.radians(tilt)
        sc.render.resolution_x = width
        sc.render.resolution_y = height
        cam.data.ortho_scale = view
        cam.rotation_euler = (math.radians(90 - tilt), 0, 0)
        cam.location = (0, -math.cos(e) * 12, math.sin(e) * 12 + look)

    try:
        sc.eevee.taa_render_samples = 48
    except AttributeError:
        pass
    # standing, turned eight ways
    aim(400, 480, 2.25, 0.9, 12)
    pose("idle", 0.25)
    for layer, (vis, hold) in HERO_LAYERS.items():
        show_only(groups, vis, hold)
        row = []
        for f in range(8):
            turn.rotation_euler.z = -math.radians(45) * f
            row.append(render_array())
        save_sheet([row], os.path.join(OUT, f"hero-{layer}.png"))
    # the face for the round frame, turned a little
    aim(256, 256, 1.05, 1.22, 10)
    turn.rotation_euler.z = math.radians(-18)
    for layer in ("base", "tunic", "helm", "cap", "hat", "cloak"):
        vis, hold = HERO_LAYERS[layer]
        show_only(groups, vis, hold)
        save_sheet([[render_array()]], os.path.join(OUT, f"portrait-{layer}.png"))
elif PREVIEW:
    bpy.context.scene.render.resolution_percentage = 250
    show_only(groups, ("base", "hair", "tunic", "sword", "helm"))
    for ob in groups["helm"]:
        ob.hide_render = True
    row = []
    for f, (kind, t) in ((0, ("idle", 0.25)), (1, ("walk", 0.25)), (6, ("attack", 0.25)), (4, ("idle", 0.25))):
        turn.rotation_euler.z = -math.radians(45) * f
        pose(kind, t)
        row.append(render_array())
    for ob in groups["helm"]:
        ob.hide_render = False
    show_only(groups, ("base", "tunic", "axe", "helm"))
    turn.rotation_euler.z = math.radians(-30)
    pose("idle", 0.25)
    row.append(render_array())
    save_sheet([row], os.path.join(OUT, "player_preview.png"))
else:
    for layer, (vis, hold) in LAYERS.items():
        show_only(groups, vis, hold)
        rows = []
        for f in range(8):
            turn.rotation_euler.z = -math.radians(45) * f
            row = []
            for kind, t in FRAMES:
                pose(kind, t)
                row.append(render_array())
            rows.append(row)
        save_sheet(rows, os.path.join(OUT, f"player-{layer}.png"))

"""Shared helpers: toon materials, simple shapes, the 2.5D camera and sprite sheets.

Run through Blender in the background, see art/README.md. Everything is built
from code, so the art can be changed and rendered again at any time.
"""
import math
import os
import tempfile

import bpy
import numpy as np
from mathutils import Vector

OUTLINE = (0.07, 0.035, 0.03)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb(hex_color):
    """0xRRGGBB to linear RGB."""
    out = []
    for shift in (16, 8, 0):
        c = ((hex_color >> shift) & 255) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


_mats = {}


def toon(name, color, dark=0.62, light=1.18):
    """Flat cartoon material with three tones."""
    if name in _mats:
        return _mats[name]
    rgb = srgb(color) if isinstance(color, int) else color
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (1, 1, 1, 1)
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    el = ramp.color_ramp.elements
    el[0].position = 0.0
    el[0].color = (*[c * dark for c in rgb], 1)
    el[1].position = 0.28
    el[1].color = (*rgb, 1)
    hi = el.new(0.8)
    hi.color = (*[min(1, c * light + 0.02) for c in rgb], 1)
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(diff.outputs[0], to_rgb.inputs[0])
    nt.links.new(to_rgb.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], emit.inputs[0])
    nt.links.new(emit.outputs[0], out.inputs[0])
    _mats[name] = m
    return m


def flat(name, color):
    if name in _mats:
        return _mats[name]
    rgb = srgb(color) if isinstance(color, int) else color
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs[0].default_value = (*rgb, 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(emit.outputs[0], out.inputs[0])
    m.use_backface_culling = True
    _mats[name] = m
    return m


def _finish(ob, name, mat, parent, smooth, outline):
    ob.name = name
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    if outline:
        ob.data.materials.append(flat("outline", OUTLINE))
        mod = ob.modifiers.new("outline", "SOLIDIFY")
        mod.thickness = outline
        mod.offset = 1
        mod.use_flip_normals = True
        mod.material_offset = 1
        mod.use_rim = False
    if parent:
        ob.parent = parent
    return ob


def apply(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def ball(name, loc, size, mat, parent=None, outline=0.03, rot=(0, 0, 0), seg=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1)
    ob = bpy.context.object
    ob.scale = size if isinstance(size, tuple) else (size, size, size)
    ob.rotation_euler = rot
    apply(ob)
    ob.location = loc
    return _finish(ob, name, mat, parent, True, outline)


def cone(name, loc, r1, r2, h, mat, parent=None, outline=0.03, rot=(0, 0, 0), scale=(1, 1, 1), seg=28, bevel=0.05):
    """Tapered cylinder; r1 at the bottom. `loc` is its centre."""
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=max(r2, 0.001), depth=h)
    ob = bpy.context.object
    ob.scale = scale
    ob.rotation_euler = rot
    apply(ob)
    ob.location = loc
    if bevel:
        b = ob.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 3
        b.limit_method = "ANGLE"
    return _finish(ob, name, mat, parent, True, outline)


def box(name, loc, size, mat, parent=None, outline=0.03, rot=(0, 0, 0), bevel=0.03):
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.object
    ob.scale = size
    ob.rotation_euler = rot
    apply(ob)
    ob.location = loc
    if bevel:
        b = ob.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 3
    return _finish(ob, name, mat, parent, False, outline)


def ring(name, loc, r, thick, mat, parent=None, outline=0.02, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=thick, major_segments=36, minor_segments=12)
    ob = bpy.context.object
    ob.scale = scale
    ob.rotation_euler = rot
    apply(ob)
    ob.location = loc
    return _finish(ob, name, mat, parent, True, outline)


def pivot(name, loc, parent=None):
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.parent = parent
    return ob


def stage(width, height, view_height, look_z):
    """Orthographic camera 30 degrees above the ground, like the game's 2:1 tiles."""
    sc = bpy.context.scene
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = engine
            break
        except TypeError:
            continue
    sc.render.resolution_x = width
    sc.render.resolution_y = height
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    try:
        sc.eevee.taa_render_samples = 24
    except AttributeError:
        pass
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.25
    sc.world = world

    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "VERTICAL"
    cam.data.ortho_scale = view_height
    el = math.radians(30)
    cam.location = Vector((0, -math.cos(el) * 12, math.sin(el) * 12 + look_z))
    cam.rotation_euler = (math.radians(60), 0, 0)
    sc.camera = cam

    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.data.use_shadow = False
    sun.rotation_euler = (math.radians(48), math.radians(-28), 0)
    bpy.context.collection.objects.link(sun)


def render_array():
    path = os.path.join(tempfile.gettempdir(), f"hv_frame_{os.getpid()}.png")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    return buf.reshape(h, w, 4)[::-1]  # top row first


def save_sheet(rows, path):
    """rows: list of rows of frames (arrays)."""
    sheet = np.concatenate([np.concatenate(r, axis=1) for r in rows], axis=0)
    h, w = sheet.shape[:2]
    img = bpy.data.images.new("sheet", w, h, alpha=True)
    img.pixels.foreach_set(sheet[::-1].astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    print("saved", path, w, h)


def show_only(groups, visible, holdout=()):
    """groups: name -> objects. Shows some, cuts out others, hides the rest."""
    for name, obs in groups.items():
        for ob in obs:
            ob.hide_render = not (name in visible or name in holdout)
            ob.is_holdout = name in holdout

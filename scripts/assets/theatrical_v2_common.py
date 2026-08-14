"""Proposed theatrical v2 sculpt helpers. Never writes production-library/.

New explorer redesign. Does not import v1 / v1.1 blends or rejected GLB blockouts.
"""

from __future__ import annotations

import math
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PRODUCTION_LIBRARY = REPO_ROOT / "production-library"
PROPOSED_V2 = REPO_ROOT / "theatrical-foundation/proposed/v2"
TEXTURES_V2 = PROPOSED_V2 / "textures"
REFS_V2 = PROPOSED_V2 / "references"

# Binding albedo (linear-ish display). Lighting is separate.
PIP_LIME = (0.62, 0.74, 0.18)
PIP_BELLY = (0.93, 0.88, 0.52)
PIP_CORAL = (0.86, 0.38, 0.32)
PIP_BEAK = (0.78, 0.38, 0.18)
PIP_TEAL = (0.10, 0.48, 0.48)
PIP_TEAL_DEEP = (0.04, 0.22, 0.24)
PIP_CINNAMON = (0.55, 0.32, 0.16)
PIP_TAIL = (0.92, 0.62, 0.22)
PIP_COPPER = (0.72, 0.40, 0.16)
PIP_MOUTH = (0.55, 0.18, 0.20)

GOAT_OAT = (0.86, 0.76, 0.58)
GOAT_CREAM = (0.93, 0.86, 0.72)
GOAT_CINNAMON = (0.62, 0.32, 0.14)
GOAT_HAZEL = (0.48, 0.30, 0.10)
GOAT_PLUM = (0.28, 0.10, 0.16)
GOAT_HORN = (0.42, 0.24, 0.12)
GOAT_ORANGE = (0.78, 0.32, 0.10)
GOAT_HOOF = (0.16, 0.14, 0.13)
GOAT_EAR_IN = (0.90, 0.62, 0.52)
GOAT_TEAL = (0.10, 0.48, 0.48)
SCLERA = (0.97, 0.97, 0.96)
CORNEA = (0.85, 0.92, 0.95)
CLAY = (0.62, 0.60, 0.58)


def assert_not_production_library(path: Path) -> None:
    resolved = path.resolve()
    lib = PRODUCTION_LIBRARY.resolve()
    if resolved == lib or lib in resolved.parents:
        raise PermissionError(f"refusing to write inside production-library/: {path}")


def reset_scene():
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(obj):
    import bpy

    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    return obj


def apply_all(obj):
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def smooth(obj):
    if obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True


def principled_mat(
    name,
    color,
    *,
    roughness=0.45,
    specular=0.25,
    subsurface=0.0,
    sheen=0.0,
    metallic=0.0,
    coat=0.0,
    coat_rough=0.08,
    transmission=0.0,
    ior=1.45,
):
    import bpy

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        return mat
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    for key in ("Specular IOR Level", "Specular"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = specular
            break
    for key in ("Subsurface Weight", "Subsurface"):
        if key in bsdf.inputs and subsurface:
            bsdf.inputs[key].default_value = subsurface
            break
    if "Subsurface Radius" in bsdf.inputs and subsurface:
        bsdf.inputs["Subsurface Radius"].default_value = (0.8, 0.45, 0.25)
    for key in ("Sheen Weight", "Sheen"):
        if key in bsdf.inputs and sheen:
            bsdf.inputs[key].default_value = sheen
            break
    for key in ("Coat Weight", "Clearcoat"):
        if key in bsdf.inputs and coat:
            bsdf.inputs[key].default_value = coat
            break
    for key in ("Coat Roughness", "Clearcoat Roughness"):
        if key in bsdf.inputs and coat:
            bsdf.inputs[key].default_value = coat_rough
            break
    for key in ("Transmission Weight", "Transmission"):
        if key in bsdf.inputs and transmission:
            bsdf.inputs[key].default_value = transmission
            break
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = ior
    return mat


def fuzz_mat(name, color, *, roughness=0.52, subsurface=0.16, sheen=0.38):
    return principled_mat(
        name,
        color,
        roughness=roughness,
        subsurface=subsurface,
        sheen=sheen,
        specular=0.20,
    )


def cloth_mat(name, color):
    return principled_mat(name, color, roughness=0.62, sheen=0.18, specular=0.12)


def metal_mat(name, color, metallic=0.82, roughness=0.32):
    return principled_mat(name, color, roughness=roughness, metallic=metallic, specular=0.5)


def assign(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def new_mesh(name, verts, faces):
    import bpy

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    link(obj)
    smooth(obj)
    return obj


def lathe(name, profile, segments=40, flatten_y=1.0, scallop=0.0, scallop_freq=8):
    """Build a continuous body of revolution from (radius, z) rings, then sculpt.

    This is a silhouette lathe, not stacked primitives and not a voxel remesh.
    """
    import bmesh
    import bpy
    from mathutils import Vector

    bm = bmesh.new()
    prev = None
    for radius, z in profile:
        v = bm.verts.new((max(radius, 0.0015), 0.0, z))
        if prev is not None:
            bm.edges.new((prev, v))
        prev = v
    geom = list(bm.verts) + list(bm.edges)
    bmesh.ops.spin(
        bm,
        geom=geom,
        angle=math.tau,
        steps=segments,
        axis=(0.0, 0.0, 1.0),
        cent=(0.0, 0.0, 0.0),
    )
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    link(obj)
    zmin = min(z for _r, z in profile)
    zmax = max(z for _r, z in profile)
    span = max(1e-6, zmax - zmin)
    for vert in obj.data.vertices:
        co = vert.co
        t = (co.z - zmin) / span
        theta = math.atan2(co.x, -co.y)
        radial = Vector((co.x, co.y, 0.0))
        if radial.length > 1e-6:
            scale = flatten_y if abs(co.y) > abs(co.x) * 0.15 else 1.0
            # slight Y squash for pear/bean, plus silhouette breakup
            if flatten_y != 1.0:
                co.y *= flatten_y
            if scallop:
                bump = 1.0 + scallop * math.sin(theta * scallop_freq) * math.sin(t * math.pi)
                co.x *= bump
                co.y *= bump
            vert.co = co
    obj.data.update()
    smooth(obj)
    return obj


def leaf_feather(name, length=0.16, width=0.055, thick=0.01, segs=10):
    """Leaf-shaped feather. Not a rectangle."""
    verts = []
    faces = []
    for i in range(segs + 1):
        t = i / segs
        # teardrop: wide mid, pinched tip and quill
        envelope = math.sin(t * math.pi) ** 1.15
        if t < 0.12:
            envelope *= t / 0.12
        y = -t * length
        w = width * envelope
        z = 0.004 * math.sin(t * math.pi)
        verts.append((-w, y, z + thick * 0.5))
        verts.append((w, y, z + thick * 0.5))
        verts.append((-w * 0.85, y, z - thick * 0.5))
        verts.append((w * 0.85, y, z - thick * 0.5))
        if i:
            a = (i - 1) * 4
            b = i * 4
            faces.append((a, a + 1, b + 1, b))
            faces.append((a + 2, b + 2, b + 3, a + 3))
            faces.append((a, b, b + 2, a + 2))
            faces.append((a + 1, a + 3, b + 3, b + 1))
    return new_mesh(name, verts, faces)


def place(obj, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    obj.location = loc
    obj.rotation_euler = rot
    if scale is not None:
        obj.scale = scale if isinstance(scale, tuple) else (scale, scale, scale)
    apply_all(obj)
    return obj


def eye_stack(prefix, loc, radius, iris_rgb, look=(0.0, -1.0, 0.0)):
    import bpy
    from mathutils import Vector

    look_v = Vector(look).normalized()
    sclera = bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=radius, location=loc)
    sclera = bpy.context.object
    sclera.name = f"{prefix}_sclera"
    sclera.scale = (1.0, 0.92, 0.96)
    apply_all(sclera)
    assign(sclera, principled_mat(f"{prefix}_sclera_mat", SCLERA, roughness=0.22, coat=0.35, specular=0.45))

    iris_loc = Vector(loc) + look_v * radius * 0.62
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24,
        radius=radius * 0.62,
        depth=radius * 0.08,
        location=iris_loc,
    )
    iris = bpy.context.object
    iris.name = f"{prefix}_iris"
    iris.rotation_euler = look_v.to_track_quat("Z", "Y").to_euler()
    apply_all(iris)
    assign(iris, principled_mat(f"{prefix}_iris_mat", iris_rgb, roughness=0.28, coat=0.2, specular=0.4))

    pupil_loc = Vector(loc) + look_v * radius * 0.70
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=20,
        radius=radius * 0.28,
        depth=radius * 0.06,
        location=pupil_loc,
    )
    pupil = bpy.context.object
    pupil.name = f"{prefix}_pupil"
    pupil.rotation_euler = look_v.to_track_quat("Z", "Y").to_euler()
    apply_all(pupil)
    assign(pupil, principled_mat(f"{prefix}_pupil_mat", (0.02, 0.02, 0.03), roughness=0.18, specular=0.15))

    cornea = bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=radius * 1.04, location=loc)
    cornea = bpy.context.object
    cornea.name = f"{prefix}_cornea"
    cornea.scale = (1.02, 0.90, 0.98)
    apply_all(cornea)
    assign(
        cornea,
        principled_mat(
            f"{prefix}_cornea_mat",
            CORNEA,
            roughness=0.04,
            specular=0.7,
            coat=0.85,
            transmission=0.55,
            ior=1.38,
        ),
    )
    return [sclera, iris, pupil, cornea]


def lid_crescent(name, loc, radius, upper=True, rot=0.0):
    import bpy

    bpy.ops.mesh.primitive_torus_add(
        major_radius=radius * 1.02,
        minor_radius=radius * 0.16,
        major_segments=24,
        minor_segments=8,
        location=loc,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (math.radians(90), 0.0, rot)
    obj.scale = (1.05, 0.55, 1.0 if upper else 0.85)
    if not upper:
        obj.location.z -= radius * 0.12
    else:
        obj.location.z += radius * 0.18
    apply_all(obj)
    return obj


def split_hoof(name, loc, scale=0.045):
    import bpy

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=scale, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (1.15, 0.85, 0.55)
    apply_all(obj)
    # cleft
    for vert in obj.data.vertices:
        if abs(vert.co.x - loc[0]) < scale * 0.12:
            vert.co.z -= scale * 0.12
    obj.data.update()
    assign(obj, principled_mat(f"{name}_mat", GOAT_HOOF, roughness=0.55, specular=0.12))
    return obj


def subdiv(obj, levels=2):
    """Catmull-Clark smoothing. Not a voxel remesh."""
    import bpy

    if obj.type != "MESH":
        return obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("Subdiv", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    bpy.ops.object.modifier_apply(modifier="Subdiv")
    smooth(obj)
    return obj


def limb(name, head, tail, radius_head, radius_tail=None, segs=16):
    """Tapered limb between two points. One mesh, not a floating primitive."""
    import bpy
    from mathutils import Vector

    h = Vector(head)
    t = Vector(tail)
    direction = t - h
    length = direction.length
    if length < 1e-6:
        raise ValueError("limb has zero length")
    mid = (h + t) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=segs,
        radius1=radius_head,
        radius2=radius_tail if radius_tail is not None else radius_head * 0.75,
        depth=length,
        location=mid,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    apply_all(obj)
    return obj


def pretty_eye(prefix, loc, radius, iris_rgb, look=(0.0, -1.0, 0.0)):
    """Readable glossy eye: sclera + iris + pupil + catch. No washed-out cornea orb."""
    import bpy
    from mathutils import Vector

    look_v = Vector(look).normalized()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=radius, location=loc)
    sclera = bpy.context.object
    sclera.name = f"{prefix}_sclera"
    sclera.scale = (1.02, 0.88, 0.98)
    apply_all(sclera)
    subdiv(sclera, 1)
    assign(sclera, principled_mat(f"{prefix}_sclera_mat", SCLERA, roughness=0.18, coat=0.55, specular=0.55))

    # Sit iris/pupil on the front surface. Earlier placements were inside the sclera.
    iris_loc = Vector(loc) + look_v * (radius * 0.90)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32, radius=radius * 0.70, depth=radius * 0.07, location=iris_loc
    )
    iris = bpy.context.object
    iris.name = f"{prefix}_iris"
    iris.rotation_euler = look_v.to_track_quat("Z", "Y").to_euler()
    apply_all(iris)
    assign(iris, principled_mat(f"{prefix}_iris_mat", iris_rgb, roughness=0.22, coat=0.35, specular=0.5))

    pupil_loc = Vector(loc) + look_v * (radius * 0.94)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24, radius=radius * 0.30, depth=radius * 0.06, location=pupil_loc
    )
    pupil = bpy.context.object
    pupil.name = f"{prefix}_pupil"
    pupil.rotation_euler = look_v.to_track_quat("Z", "Y").to_euler()
    apply_all(pupil)
    assign(pupil, principled_mat(f"{prefix}_pupil_mat", (0.015, 0.015, 0.02), roughness=0.12, specular=0.2))

    catch_loc = Vector(loc) + look_v * (radius * 1.00) + Vector((radius * 0.22, 0.0, radius * 0.20))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=radius * 0.10, location=catch_loc)
    catch = bpy.context.object
    catch.name = f"{prefix}_catch"
    apply_all(catch)
    assign(catch, principled_mat(f"{prefix}_catch_mat", (1, 1, 1), roughness=0.04, coat=0.8, specular=0.8))
    return [sclera, iris, pupil, catch]


def bounds(objs):
    import mathutils

    mins = mathutils.Vector((1e9, 1e9, 1e9))
    maxs = mathutils.Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            mins.x, mins.y, mins.z = min(mins.x, world.x), min(mins.y, world.y), min(mins.z, world.z)
            maxs.x, maxs.y, maxs.z = max(maxs.x, world.x), max(maxs.y, world.y), max(maxs.z, world.z)
    return mins, maxs

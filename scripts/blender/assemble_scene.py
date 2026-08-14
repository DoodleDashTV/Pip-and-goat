"""Assemble and render a Doodle Dash production scene (real bpy implementation)."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

# Allow running both inside Blender (--python) and importing helpers.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import emit, parse_blender_args, require_asset  # noqa: E402


def eevee_engine_id(scene) -> str:
    """Return the EEVEE engine enum id for the running Blender version.

    Blender 4.2+ renamed the real-time engine from ``BLENDER_EEVEE`` to
    ``BLENDER_EEVEE_NEXT``. Pick whichever enum this build actually exposes so
    the same production script renders on 3.x and 4.2+.
    """
    try:
        prop = scene.render.bl_rna.properties["engine"]
        available = {item.identifier for item in prop.enum_items}
    except Exception:  # pragma: no cover - defensive
        available = set()
    if "BLENDER_EEVEE_NEXT" in available:
        return "BLENDER_EEVEE_NEXT"
    return "BLENDER_EEVEE"


def set_eevee(scene, samples: int = 32) -> None:
    scene.render.engine = eevee_engine_id(scene)
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = max(1, samples)
    # EEVEE-Next: raytraced shadows give real contact shadows and occlusion, so
    # characters sit in the scene instead of looking pasted onto the grass. The
    # legacy gtao switch is a no-op in this engine.
    if hasattr(scene, "eevee"):
        for attr in ("use_raytracing", "use_shadows", "use_soft_shadows"):
            if hasattr(scene.eevee, attr):
                setattr(scene.eevee, attr, True)
        # EEVEE-Next traces shadows with very few rays and steps by default,
        # which speckles curved low-poly surfaces with shadow acne — visible on
        # the goat's flank as dirt that no amount of extra render samples
        # removes, because it is a bias artefact rather than noise.
        #
        # 2 rays / 8 steps was enough while the sun was weak. With a key strong
        # enough to throw a readable ground shadow, the same artefact returns as
        # dark stipple across Pip's belly, where a wing sits a couple of
        # centimetres from the body. Measured against a 48-sample reference, the
        # error inside Pip's silhouette falls from 4.09 RMS (60.6 peak) at 2/8 to
        # 2.06 RMS (16.3 peak) at 4/16, and neither raising render samples nor
        # pushing the shadow caster deeper inside the mesh fixes it: a deeper
        # caster self-intersects and stamps craters on the head instead. The
        # frame costs about 73% more to render, which is the price of the shadow.
        for attr, value in (("shadow_ray_count", 4), ("shadow_step_count", 16)):
            if hasattr(scene.eevee, attr):
                setattr(scene.eevee, attr, value)


def append_object(blend_path: str, names: list[str] | None = None):
    import bpy

    with bpy.data.libraries.load(blend_path, link=False) as (data_from, data_to):
        if names:
            data_to.objects = [n for n in data_from.objects if n in names]
            data_to.actions = list(data_from.actions)
            data_to.armatures = list(data_from.armatures)
        else:
            data_to.objects = list(data_from.objects)
            data_to.actions = list(data_from.actions)
            data_to.armatures = list(data_from.armatures)
    imported = []
    for obj in data_to.objects:
        if obj is not None:
            bpy.context.collection.objects.link(obj)
            imported.append(obj)
    return imported


def find_armature(objects):
    for obj in objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def strip_imported_lights_and_cameras(objects) -> dict:
    """Remove lights/cameras that ride along inside asset blends.

    Every founding blend ships its own reference lighting rig and reference
    camera. Appending four of them stacked 8 lights and 3 stray cameras into the
    shot, which is what washed out the first 1080p acceptance render. The shot
    owns its lighting and camera; assets only contribute geometry.
    """
    import bpy

    # Snapshot names first: removing an object invalidates every Python handle to
    # it, so the survivor list has to be rebuilt by name afterwards.
    inventory = [(obj.name, obj.type) for obj in objects]
    removed = {"lights": [], "cameras": []}
    for name, kind in inventory:
        if kind not in ("LIGHT", "CAMERA"):
            continue
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        removed["lights" if kind == "LIGHT" else "cameras"].append(name)
        bpy.data.objects.remove(obj, do_unlink=True)
    removed["survivors"] = [name for name, kind in inventory if kind not in ("LIGHT", "CAMERA")]
    return removed


def placement_root(role: str, objects):
    """The single object to move so a whole multi-object asset travels together.

    Moving "the first imported mesh" detached ``MapMark`` from ``AdventureMap``.
    Prefer the armature, then an existing root parent, otherwise group the
    asset's top-level objects under a fresh empty and move that, which preserves
    every internal transform and parent/child relationship.
    """
    import bpy

    arm = find_armature(objects)
    if arm is not None:
        return arm, "armature"

    live = [o for o in objects if o.name in bpy.data.objects]
    if not live:
        return None, "none"

    # Freshly appended objects have no evaluated transform yet, and reading
    # matrix_world in that state hands back a matrix with the object's scale
    # missing. Baking that into the reparent quietly reset every scaled object in
    # the meadow to scale 1: the sky dome inflated from a squashed dome to a full
    # sphere, and the flat dirt path became the 1 m cube that stood in the middle
    # of the acceptance render looking like an untextured slab.
    bpy.context.view_layer.update()

    tops = [o for o in live if o.parent is None or o.parent not in live]
    if len(tops) == 1:
        return tops[0], "existing-root"

    root = bpy.data.objects.new(f"{role}_Root", None)
    bpy.context.collection.objects.link(root)
    for obj in tops:
        # keep_transform equivalent: preserve the world matrix across reparenting
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = world
    # Reparenting leaves cached world matrices stale until the depsgraph runs.
    bpy.context.view_layer.update()
    return root, "created-root"


def apply_action(arm, action_name: str | None, frame_start: int, frame_end: int) -> bool:
    """Bind a named action to an armature. Returns False when it cannot be found.

    Matching is exact (case-insensitive) rather than fuzzy substring: a loose
    match silently binding the wrong action is worse than failing closed.
    """
    import bpy

    if not arm or not action_name:
        return False
    action = bpy.data.actions.get(action_name)
    if not action:
        wanted = action_name.lower()
        action = next((a for a in bpy.data.actions if a.name.lower() == wanted), None)
    if not action:
        return False
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    arm.animation_data.action_extrapolation = "HOLD"

    # An action shorter than the shot would otherwise freeze on its last pose for
    # the remainder of the render. Repeat it instead so the character stays alive.
    a_start, a_end = action.frame_range
    if (a_end - a_start) > 0 and (a_end - a_start) < (frame_end - frame_start):
        for fcurve in action.fcurves:
            if not any(m.type == "CYCLES" for m in fcurve.modifiers):
                fcurve.modifiers.new(type="CYCLES")
    return True


#: How far inside its own surface a character's shadow caster sits.
SHADOW_PROXY_SHRINK = 0.022
#: No piece of the caster travels further inward than this share of its own
#: half-thickness. A closed surface pushed in by more than half its thinnest
#: dimension passes through its own middle and comes out inside out, and an
#: inside-out caster throws a shadow that has nothing to do with the shape the
#: camera sees. Pip's beak tip is 15 mm across: the flat 22 mm shrink turned it
#: into a knob hanging in front of the face, and the knob's shadow was the band
#: down Pip's chest.
SHADOW_PROXY_SAFE_FRACTION = 0.5
#: A part with less room than this to give away cannot be a caster at all: there
#: is no inside for it to hide in. Flat decals - the star on Pip's backpack, the
#: ink on the Goat's tag - are collapsed to a point instead, which casts nothing.
SHADOW_PROXY_MIN_ROOM = 0.001
#: Vertex group carrying the per-part share of the shrink, on the caster only.
SHADOW_PROXY_VERTEX_GROUP = "DDP_ShadowShrink"
#: How far a part's shadow may land from the part, as a multiple of the part's own
#: width across the light, before that part stops casting.
#:
#: A shadow that lands further from the thing that cast it than that thing is wide
#: is a mark the audience cannot attribute to anything on screen. Pip's beak is
#: 75 mm across and points down at the chest; from the beak the sun leaves the body
#: sphere within six degrees of tangent, so the beak's occlusion was drawn out into
#: a 250 mm stripe down the front of the body - three and a third times the beak's
#: own width, and the vertical seam below the beak. The mesh underneath it is clean:
#: the stripe tracks the beak, not the geometry it falls on.
#:
#: One is not a tuned value. It is the point at which a part's shadow stops being
#: next to the part. Measured over both founding characters, the parts that sit on
#: a surface score 1.1 to 5.7 and the parts that make up the body score 0.1 to 0.9.
SHADOW_PROXY_SELF_REACH = 1.0
#: ...and only when that is where most of what the part blocks actually goes. A
#: part whose shadow mostly reaches the set keeps casting however far it throws:
#: Pip's wings and the Goat's horns shadow the body on the side away from the sun,
#: but most of what they block lands on the meadow, and that is the shadow the
#: audience reads as the character's.
SHADOW_PROXY_SELF_SHARE = 0.5
#: Rays per part for the measurement. The parts in question have 8-392 vertices.
SHADOW_PROXY_SELF_SAMPLES = 64
#: How far clear of the enclosing surface every point of a part must sit before the
#: part counts as sealed inside it. A part that reaches the surface is seen at it:
#: the Goat's tag letters are extruded rings whose inner wall is its own island,
#: lies inside the outer wall and meets its front and back faces, and the letter is
#: read through exactly that wall. Pip's buried beak tip clears the beak by 0.7 mm
#: at its closest point, seven times over.
SHADOW_PROXY_SEALED_CLEARANCE = 0.0001
#: Suffix every shadow caster carries, so other tools can tell proxies apart
#: from the geometry the camera actually sees.
SHADOW_PROXY_SUFFIX = "_ShadowProxy"


def mesh_islands(mesh) -> list[list[int]]:
    """Vertex indices of each connected piece of a mesh.

    The founding characters are primitives welded into one mesh, so every sphere,
    bar and disc that was joined is still its own island, and thickness has to be
    judged per island rather than per mesh.
    """
    neighbours: dict[int, list[int]] = {v.index: [] for v in mesh.vertices}
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbours[a].append(b)
        neighbours[b].append(a)
    seen: set[int] = set()
    islands = []
    for start in range(len(mesh.vertices)):
        if start in seen:
            continue
        stack, comp = [start], []
        seen.add(start)
        while stack:
            current = stack.pop()
            comp.append(current)
            for other in neighbours[current]:
                if other not in seen:
                    seen.add(other)
                    stack.append(other)
        islands.append(comp)
    return islands


#: How many times the planner may halve its first guess before giving up on an
#: island and collapsing it instead.
SHADOW_PROXY_FIT_STEPS = 5
#: Fixed direction for the inside/outside parity test. Any direction works; a
#: constant one keeps the planner deterministic.
_PARITY_RAY = (0.5773502691896258, 0.5773502691896258, 0.5773502691896258)


def _inside(tree, point) -> bool:
    """Is the point inside this island's shell? Counted by surface crossings."""
    from mathutils import Vector

    direction = Vector(_PARITY_RAY)
    origin = point.copy()
    crossings = 0
    for _ in range(32):
        hit = tree.ray_cast(origin, direction)
        if hit[0] is None:
            break
        crossings += 1
        origin = hit[0] + direction * 1e-6
    return crossings % 2 == 1


def island_room(mesh, comp: list[int], tree) -> float:
    """How far inward every point of one island can travel and stay inside it.

    The first guess is measured through the island rather than around it: from
    each vertex, a ray straight into the surface reports how much material lies
    behind that point, and half of the smallest reading is where the island's
    middle is. A bounding box cannot answer this - the Goat's ears are thin discs
    held at an angle, so their box is generous in all three axes while the ears
    are 8 mm thick.

    Thickness alone is not enough either, because offsetting a concave shape
    inward makes it cross itself before it reaches its middle: the letters on the
    Goat's tag have thickness to spare and still poked through their own faces.
    So the guess is then checked by actually moving every vertex and asking
    whether it is still inside, and halved until it is.
    """
    thinnest = None
    for index in comp:
        vertex = mesh.vertices[index]
        normal = vertex.normal
        if normal.length_squared < 1e-12:
            continue
        origin = vertex.co - normal * 1e-5
        hit = tree.ray_cast(origin, -normal)
        if hit[0] is None:
            # Nothing behind this point: the island is a single-sided sheet and has
            # no inside to hide a caster in.
            return 0.0
        through = (hit[0] - vertex.co).length
        thinnest = through if thinnest is None else min(thinnest, through)
    if thinnest is None:
        return 0.0

    room = SHADOW_PROXY_SAFE_FRACTION * thinnest / 2.0
    for _ in range(SHADOW_PROXY_FIT_STEPS):
        if room < SHADOW_PROXY_MIN_ROOM:
            return 0.0
        if all(
            _inside(tree, mesh.vertices[i].co - mesh.vertices[i].normal * room)
            for i in comp
        ):
            return room
        room *= 0.5
    return 0.0


def buried_islands(islands, trees, coords) -> set[int]:
    """Islands sealed inside another island of the same mesh.

    A part the camera can never see still casts, and what it blocks is a mark the
    audience has nothing on screen to attribute to. Pip's beak is a 45x99x37 mm
    sphere with a second 20x31x15 mm sphere authored inside it - 0.7 mm clear of
    its surface at the closest point, dead geometry that never reaches the
    silhouette - and the faint vertical line below the beak was that sphere's
    shadow. Both characters' pupils sit inside their irises the same way, and the
    Goat's tag has ink inside ink.

    Being sealed means every point of the part is inside the other one's surface
    and clear of it; the boxes only decide which pairs are worth measuring, which
    on these characters leaves a handful.
    """
    boxes = []
    for comp in islands:
        points = [coords[i] for i in comp]
        boxes.append(
            (
                [min(p[a] for p in points) for a in range(3)],
                [max(p[a] for p in points) for a in range(3)],
            )
        )

    def sealed_in(comp, tree) -> bool:
        for i in comp:
            near = tree.find_nearest(coords[i])
            if near[0] is None or (coords[i] - near[0]).length < SHADOW_PROXY_SEALED_CLEARANCE:
                return False
            if not _inside(tree, coords[i]):
                return False
        return True

    buried = set()
    for inner, comp in enumerate(islands):
        low, high = boxes[inner]
        for outer in range(len(islands)):
            if outer == inner or trees[outer] is None:
                continue
            outer_low, outer_high = boxes[outer]
            if any(low[a] < outer_low[a] or high[a] > outer_high[a] for a in range(3)):
                continue
            if sealed_in(comp, trees[outer]):
                buried.add(inner)
                break
    return buried


def island_self_shadow(mesh, comp, weights, tree, island_of_face, island, light):
    """Where does one part's shadow land on the character that threw it?

    Traces from the caster's surface along the light and asks what the shadow
    falls on. Hits on the part itself are stepped through - the caster sits inside
    the visible surface, so the ray has to leave that surface before it can land
    anywhere - and the first hit on any other part of the character is recorded.

    Returns the share of sampled light-facing rays that land on the character at
    all, and how far the furthest of them travels as a multiple of the part's own
    width across the light. A part is only as wide as its silhouette, so the width
    is measured in the plane the light projects onto rather than as a bounding box.
    """
    lit = [
        i
        for i in comp
        if mesh.vertices[i].normal.length_squared > 1e-12
        and mesh.vertices[i].normal.dot(light) < 0.0
    ]
    if not lit:
        return 0.0, 0.0
    step = max(1, len(lit) // SHADOW_PROXY_SELF_SAMPLES)
    sampled = lit[::step]

    across_u = light.orthogonal().normalized()
    across_v = light.cross(across_u).normalized()
    us = [mesh.vertices[i].co.dot(across_u) for i in comp]
    vs = [mesh.vertices[i].co.dot(across_v) for i in comp]
    width = max(max(us) - min(us), max(vs) - min(vs))
    if width <= 0.0:
        return 0.0, 0.0

    landed = 0
    furthest = 0.0
    for i in sampled:
        vertex = mesh.vertices[i]
        start = vertex.co - vertex.normal * (weights[i] * SHADOW_PROXY_SHRINK)
        origin = start + light * 1e-5
        for _ in range(8):
            location, _normal, face, _distance = tree.ray_cast(origin, light)
            if location is None or face is None:
                break
            if island_of_face[face] == island:
                origin = location + light * 1e-5
                continue
            landed += 1
            furthest = max(furthest, (location - start).length)
            break
    return landed / len(sampled), furthest / width


def plan_shadow_shrink(mesh, light=None) -> tuple[list[float], list[list[int]]]:
    """Per-vertex share of the shrink, and the islands that must not displace.

    Returns the weight for every vertex and the islands to collapse instead. An
    island is collapsed when it is sealed inside another island, when it has no
    inside to hide a caster in, and - when a light direction is supplied - when it
    is a part sitting on the character rather than one of its masses and the shadow
    it throws lands on the character itself, further away than the part is wide.
    """
    from mathutils.bvhtree import BVHTree

    weights = [0.0] * len(mesh.vertices)
    collapse = []
    coords = [v.co.copy() for v in mesh.vertices]
    islands = mesh_islands(mesh)
    island_of_vertex = {i: n for n, comp in enumerate(islands) for i in comp}
    trees = []
    for comp in islands:
        member = set(comp)
        polys = [list(p.vertices) for p in mesh.polygons if all(v in member for v in p.vertices)]
        trees.append(
            BVHTree.FromPolygons(coords, polys, all_triangles=False, epsilon=0.0)
            if polys
            else None
        )

    buried = buried_islands(islands, trees, coords)
    for island, comp in enumerate(islands):
        tree = trees[island]
        if tree is None or island in buried:
            collapse.append(comp)
            continue
        room = island_room(mesh, comp, tree)
        if room < SHADOW_PROXY_MIN_ROOM:
            collapse.append(comp)
            continue
        share = min(SHADOW_PROXY_SHRINK, room) / SHADOW_PROXY_SHRINK
        for i in comp:
            weights[i] = share

    if light is None:
        return weights, collapse

    # One tree over the whole visible mesh, because the receiver of a part's
    # shadow is the surface the camera sees, not the caster.
    faces = [list(p.vertices) for p in mesh.polygons]
    whole = BVHTree.FromPolygons(coords, faces, all_triangles=False, epsilon=0.0)
    island_of_face = [island_of_vertex[face[0]] for face in faces]
    already = {id(comp) for comp in collapse}
    for island, comp in enumerate(islands):
        if id(comp) in already:
            continue
        # A mass - a part with room for the whole shrink - always casts. These are
        # the head and the body, the surfaces whose shadow is the character's, and
        # they necessarily shadow the parts of themselves that face away from the
        # sun. Only the parts that sit on them are candidates.
        if weights[comp[0]] <= 0.0 or weights[comp[0]] >= 1.0:
            continue
        share, reach = island_self_shadow(
            mesh, comp, weights, whole, island_of_face, island, light
        )
        if share >= SHADOW_PROXY_SELF_SHARE and reach > SHADOW_PROXY_SELF_REACH:
            collapse.append(comp)
            for i in comp:
                weights[i] = 0.0
    return weights, collapse


def install_shadow_proxy(objects, light=None) -> list[str]:
    """Cast a character's shadow from a slightly shrunken copy of itself.

    The founding characters are three dozen interpenetrating primitives welded
    into one mesh, so wherever the head passes through the neck or an ear through
    the skull, two surfaces sit within a shadow-map texel of each other and the
    sun stipples the white fur with self-shadow acne. It reads as dirt, it is
    fixed to the model, and no shadow setting removes it: it survived ray and
    step counts, filter radius, jitter, resolution scale, bias, high bit depth
    and a hard-edged sun, and disappeared only when shadows were switched off
    entirely.

    Switching shadows off is not an option — without them the cast loses contact
    with the ground and looks pasted on. So the visible mesh stops casting and an
    invisible copy, pushed inside its own surface, casts instead. The proxy can
    never shadow the surface it sits inside, while the silhouette it throws on the
    ground is the character's own, a couple of centimetres smaller.

    How far inward each part goes is its own business: a head has 25 mm of room
    and takes the full shrink, a brow bar has 2.4 mm and takes that, and a flat
    decal has none and is collapsed out of the caster entirely. A part sealed
    inside another part is collapsed too, because the camera never sees it and its
    shadow is a mark with nothing on screen behind it. The caster carries its own
    copy of the mesh so the weights that express this never touch the asset the
    camera renders.

    ``light`` is the world-space direction the key light travels. Given it, a part
    whose shadow lands on its own character close to tangent is collapsed out of
    the caster too: that is where a small part's shadow stops reading as its shadow
    and becomes a band across the surface. Pip's beak was throwing such a band down
    the chest. Without it the caster is built on thickness alone, as before.
    """
    import bpy

    created = []
    for obj in [o for o in objects if o.type == "MESH" and o.name in bpy.data.objects]:
        if obj.name.endswith(SHADOW_PROXY_SUFFIX):
            continue
        proxy = obj.copy()  # carries the armature modifier and the vertex groups
        proxy.name = f"{obj.name}{SHADOW_PROXY_SUFFIX}"
        proxy.data = obj.data.copy()
        bpy.context.collection.objects.link(proxy)
        if obj.parent is not None:
            proxy.parent = obj.parent
            proxy.matrix_parent_inverse = obj.matrix_parent_inverse.copy()
        proxy.matrix_world = obj.matrix_world.copy()

        # The planner works in the mesh's own space, and the characters are placed
        # with a rotation and a translation only, so the light rotates into that
        # space and the angles it measures are the ones the renderer sees.
        local_light = None
        if light is not None:
            local_light = (obj.matrix_world.to_3x3().inverted() @ light).normalized()
        weights, collapse = plan_shadow_shrink(proxy.data, light=local_light)
        group = proxy.vertex_groups.new(name=SHADOW_PROXY_VERTEX_GROUP)
        for index, weight in enumerate(weights):
            if weight > 0.0:
                group.add([index], weight, "REPLACE")
        from mathutils import Vector

        for comp in collapse:
            centre = sum((proxy.data.vertices[i].co for i in comp), Vector()) / len(comp)
            for i in comp:
                proxy.data.vertices[i].co = centre
            # A shape key holds absolute positions, so the collapse has to hold in
            # every one of them or the part springs back when a key is dialled in.
            if proxy.data.shape_keys:
                for block in proxy.data.shape_keys.key_blocks:
                    for i in comp:
                        block.data[i].co = centre

        shrink = proxy.modifiers.new("DDP_ShadowShrink", "DISPLACE")
        shrink.mid_level = 0.0
        shrink.strength = -SHADOW_PROXY_SHRINK
        shrink.vertex_group = group.name
        proxy.visible_camera = False
        for attr in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter"):
            if hasattr(proxy, attr):
                setattr(proxy, attr, False)
        proxy.visible_shadow = True
        obj.visible_shadow = False
        created.append(proxy.name)
    return created


def apply_viseme_cues(mesh_obj, cues: list[dict], fps: int) -> None:
    if not mesh_obj or not mesh_obj.data.shape_keys:
        return
    keys = mesh_obj.data.shape_keys.key_blocks
    alias = {
        "REST": "viseme_REST",
        "A": "viseme_A",
        "E": "viseme_E",
        "I": "viseme_I",
        "O": "viseme_O",
        "U": "viseme_U",
        "MBP": "viseme_MBP",
        "M_B_P": "viseme_MBP",
        "FV": "viseme_FV",
        "F_V": "viseme_FV",
        "L": "viseme_L",
        "WQ": "viseme_WQ",
        "TH": "viseme_L",
    }
    for cue in cues:
        vis = str(cue.get("viseme") or cue.get("code") or "REST")
        key_name = alias.get(vis, vis if vis.startswith("viseme_") else f"viseme_{vis}")
        if key_name not in keys:
            continue
        start_ms = int(cue.get("startMs") or cue.get("start_ms") or 0)
        end_ms = int(cue.get("endMs") or cue.get("end_ms") or start_ms + 80)
        weight = float(cue.get("weight") or 1.0)
        f0 = max(1, int(round(start_ms / 1000 * fps)))
        f1 = max(f0 + 1, int(round(end_ms / 1000 * fps)))
        kb = keys[key_name]
        kb.value = 0.0
        kb.keyframe_insert(data_path="value", frame=max(1, f0 - 1))
        kb.value = weight
        kb.keyframe_insert(data_path="value", frame=f0)
        kb.value = weight
        kb.keyframe_insert(data_path="value", frame=f1)
        kb.value = 0.0
        kb.keyframe_insert(data_path="value", frame=f1 + 1)


def configure_camera(scene, preset: str, width: int, height: int) -> None:
    import bpy

    cam = scene.camera
    if not cam:
        cam_data = bpy.data.cameras.new("ProdCam")
        cam = bpy.data.objects.new("ProdCam", cam_data)
        bpy.context.collection.objects.link(cam)
        scene.camera = cam
    preset = (preset or "WIDE").upper()
    if preset in ("CLOSE_UP", "REACTION"):
        cam.location = (0.4, -3.2, 1.5)
        cam.rotation_euler = (math.radians(85), 0, math.radians(8))
        cam.data.lens = 50
    elif preset in ("PUSH_IN", "FOLLOW"):
        cam.location = (0, -6.5, 2.0)
        cam.rotation_euler = (math.radians(78), 0, 0)
        cam.data.lens = 35
        # simple push keyframes
        cam.keyframe_insert(data_path="location", frame=1)
        cam.location = (0, -4.8, 1.7)
        cam.keyframe_insert(data_path="location", frame=scene.frame_end)
    elif preset in ("TWO_SHOT", "MEDIUM"):
        cam.location = (0.2, -5.5, 1.8)
        cam.rotation_euler = (math.radians(80), 0, 0)
        cam.data.lens = 35
    else:  # WIDE / ESTABLISHING
        cam.location = (0, -8.0, 2.4)
        cam.rotation_euler = (math.radians(75), 0, 0)
        cam.data.lens = 28
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False


def apply_direction_camera(scene, direction: dict | None) -> dict:
    """Apply an explicit camera solve from the direction layer, when one is supplied.

    Strictly opt-in. `shot_meta["direction"]` is written only by the Steps 1-8
    direction layer; without it this returns immediately and `configure_camera`'s
    preset behaviour is what runs, unchanged. That is what lets this land alongside
    a closed acceptance: every existing caller emits no `direction` block and so
    renders exactly as before.

    The direction layer has already scored this framing against vertical-safe
    constraints, so what arrives here is a decision, not a suggestion. Applying it
    keeps the planned framing and the rendered framing the same thing, which is the
    only way the camera QC measurements mean anything.
    """
    import bpy

    if not direction:
        return {"applied": False, "reason": "no direction block"}
    camera = (direction or {}).get("camera") or {}
    geometry = camera.get("geometry") or {}
    location = geometry.get("location")
    rotation = geometry.get("rotationDegrees")
    if not location or not rotation:
        return {"applied": False, "reason": "direction block carries no explicit geometry"}

    cam = scene.camera
    if cam is None:
        return {"applied": False, "reason": "no scene camera"}

    # Clear the preset's own push keyframes before writing ours, or the two animate
    # the same channel and the preset wins on whichever frame it keyed last.
    if cam.animation_data and cam.animation_data.action:
        cam.animation_data_clear()

    cam.location = tuple(float(v) for v in location)
    cam.rotation_euler = tuple(math.radians(float(v)) for v in rotation)
    lens = camera.get("lensMm")
    if lens:
        cam.data.lens = float(lens)

    end_location = geometry.get("endLocation")
    focus_start = camera.get("focusDistanceMeters")
    focus_end = camera.get("endFocusDistanceMeters")

    if end_location:
        cam.keyframe_insert(data_path="location", frame=scene.frame_start)
        cam.location = tuple(float(v) for v in end_location)
        cam.keyframe_insert(data_path="location", frame=scene.frame_end)

    # Focus pull. A dolly move changes the camera-to-subject distance, so a single
    # static focus distance is wrong at one end of it; the planner emits both ends
    # and they are keyed here.
    if focus_start:
        cam.data.dof.focus_distance = float(focus_start)
        if focus_end and abs(float(focus_end) - float(focus_start)) > 1e-6:
            cam.data.dof.keyframe_insert(data_path="focus_distance", frame=scene.frame_start)
            cam.data.dof.focus_distance = float(focus_end)
            cam.data.dof.keyframe_insert(data_path="focus_distance", frame=scene.frame_end)

    return {
        "applied": True,
        "composition": camera.get("composition"),
        "move": camera.get("move"),
        "lensMm": cam.data.lens,
        "location": list(cam.location),
        "focusDistanceMeters": focus_start,
        "endFocusDistanceMeters": focus_end,
        "animated": bool(end_location),
    }


# ---------------------------------------------------------------------------
# Milestone 3 direction consumers.
#
# Same contract as apply_direction_camera: read only from shot_meta["direction"],
# return immediately when that block is absent, and never touch the shadow-caster
# path. A caller that emits no direction block therefore still renders exactly as
# it did before these hooks existed. LIGHTING_STATES energies are not retuned
# here; practicals are additive extras, and the approved view transform is only
# re-asserted, never replaced.
# ---------------------------------------------------------------------------

DDP_DIRECTION_NLA = "DDP_Direction"
DDP_PRACTICAL_PREFIX = "DDP_Practical_"
DDP_VFX_PREFIX = "DDP_VFX_"
#: Hard cap on instantiated VFX bodies. The planner's particle ceiling is a
#: budget, not an instruction to spawn thousands of objects in EEVEE.
DDP_VFX_INSTANCE_CAP = 24
#: Maximum additive bone rotation (radians) a direction overlay may apply.
#: Stays well inside the prototype lock's protected-feature deform ceiling.
DDP_DIRECTION_MAX_BONE_RAD = 0.12


def _direction_block(direction: dict | None) -> dict | None:
    if not direction:
        return None
    return direction


def _ms_to_frame(ms: float, fps: int, frame_start: int = 1) -> int:
    return max(frame_start, int(round(float(ms) / 1000.0 * fps)) + (frame_start - 1))


def _hex_rgb(value: str) -> tuple[float, float, float]:
    raw = str(value or "").lstrip("#")
    if len(raw) != 6:
        return (1.0, 0.92, 0.7)
    try:
        return tuple(int(raw[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    except ValueError:
        return (1.0, 0.92, 0.7)


def _find_pose_bone(arm, *names: str):
    if arm is None or arm.type != "ARMATURE":
        return None
    bones = arm.pose.bones
    wanted = {name.lower() for name in names}
    for bone in bones:
        if bone.name.lower() in wanted:
            return bone
    for bone in bones:
        lowered = bone.name.lower()
        if any(name in lowered for name in wanted):
            return bone
    return None


def _character_mesh(objs: list):
    mesh = next((o for o in objs if o.type == "MESH" and "Character" in o.name), None)
    if mesh is None:
        mesh = next((o for o in objs if o.type == "MESH"), None)
    return mesh


def _push_action_to_nla(arm, track_name: str) -> None:
    """Park the active action on an NLA track so an overlay can layer on top."""
    if arm is None or not arm.animation_data or not arm.animation_data.action:
        return
    ad = arm.animation_data
    action = ad.action
    track = ad.nla_tracks.new()
    track.name = track_name
    start = int(action.frame_range[0]) or 1
    track.strips.new(action.name, start, action)
    ad.action = None


def _overlay_action(arm, role: str):
    """Create (or reuse) the additive DDP_Direction action for this armature."""
    import bpy

    if arm is None:
        return None
    if not arm.animation_data:
        arm.animation_data_create()
    ad = arm.animation_data
    if ad.action and not any(track.name == "DDP_BaseAction" for track in ad.nla_tracks):
        _push_action_to_nla(arm, "DDP_BaseAction")
    name = f"DDP_Direction_{role}"
    action = bpy.data.actions.get(name) or bpy.data.actions.new(name=name)
    ad.action = action
    return action


def _key_bone_euler(bone, frame: int, delta: tuple[float, float, float]) -> bool:
    """Keyframe a small XYZ euler offset. Skips quaternion bones (fail-closed)."""
    if bone is None:
        return False
    if bone.rotation_mode == "QUATERNION":
        return False
    clamped = tuple(
        max(-DDP_DIRECTION_MAX_BONE_RAD, min(DDP_DIRECTION_MAX_BONE_RAD, float(v))) for v in delta
    )
    bone.rotation_mode = bone.rotation_mode or "XYZ"
    bone.rotation_euler = clamped
    bone.keyframe_insert(data_path="rotation_euler", frame=frame)
    return True


def apply_facial_cues(mesh_obj, cues: list, fps: int) -> int:
    """Drive shape keys from direction facial cues. Never edits mesh geometry.

    Prefers the planner's `channel` name (the rig profile's real key) and falls
    back to the viseme alias table so lip-sync and expression share one path.
    The shadow-caster proxy is a separate object and is not reachable from here.
    """
    if not mesh_obj or not getattr(mesh_obj.data, "shape_keys", None) or not cues:
        return 0
    keys = mesh_obj.data.shape_keys.key_blocks
    applied = 0
    for cue in cues:
        channel = str(cue.get("channel") or "")
        vis = str(cue.get("viseme") or cue.get("code") or "")
        candidates = [channel] if channel else []
        if vis:
            candidates.append(vis if vis.startswith("viseme_") else f"viseme_{vis}")
        key_name = next((name for name in candidates if name and name in keys), None)
        if key_name is None:
            continue
        start_ms = int(cue.get("startMs") or cue.get("start_ms") or 0)
        end_ms = int(cue.get("endMs") or cue.get("end_ms") or start_ms + 80)
        weight = max(0.0, min(1.0, float(cue.get("weight") or 1.0)))
        f0 = max(1, int(round(start_ms / 1000 * fps)))
        f1 = max(f0 + 1, int(round(end_ms / 1000 * fps)))
        kb = keys[key_name]
        kb.value = 0.0
        kb.keyframe_insert(data_path="value", frame=max(1, f0 - 1))
        kb.value = weight
        kb.keyframe_insert(data_path="value", frame=f0)
        kb.value = weight
        kb.keyframe_insert(data_path="value", frame=f1)
        kb.value = 0.0
        kb.keyframe_insert(data_path="value", frame=f1 + 1)
        applied += 1
    return applied


def apply_direction_acting(imported_by_role: dict, direction: dict | None, start_frame: int, end_frame: int, fps: int) -> dict:
    """Apply pose-to-pose timing, eye/head lead and weight shift when planned.

    Opt-in. Uses only bones the approved rig already has. Does not invent
    actions, does not edit production-library, and does not touch the caster.
    """
    if not direction:
        return {"applied": False, "reason": "no direction block"}
    acting = direction.get("acting") or {}
    if not acting:
        return {"applied": False, "reason": "direction block carries no acting plan"}

    roles = {}
    for role, plan in acting.items():
        objs = imported_by_role.get(role) or []
        arm = find_armature(objs)
        if arm is None:
            roles[role] = {"applied": False, "reason": "no armature"}
            continue
        _overlay_action(arm, role)
        keyed = []
        keys = list(plan.get("keys") or [])
        head = _find_pose_bone(arm, "head")
        eye_lead = int(plan.get("eyeLeadFrames") or 0)
        head_lead = int(plan.get("headLeadFrames") or 0)
        # Prototype rigs have no independent eye bones (independentEyeAim=false).
        # Eye lead is expressed as the head arriving `headLeadFrames` after the
        # look intent, which is the honest mapping for these assets.
        if head is not None and keys:
            look = next((k for k in keys if "LOOK" in str(k.get("pose") or "").upper()), keys[0])
            look_frame = int(look.get("frame") or start_frame)
            arrive = min(end_frame, look_frame + max(0, head_lead))
            if _key_bone_euler(head, max(start_frame, look_frame - max(1, eye_lead)), (0.0, 0.0, 0.0)):
                keyed.append("head-rest")
            if _key_bone_euler(head, arrive, (0.06, 0.0, 0.04)):
                keyed.append("head-lead")
            _key_bone_euler(head, end_frame, (0.0, 0.0, 0.0))
        root = _find_pose_bone(arm, "root", "pelvis")
        shift = float(plan.get("weightShift") or 0.0)
        if root is not None and abs(shift) > 1e-4:
            mid = (start_frame + end_frame) // 2
            root.location = (0.0, 0.0, 0.0)
            root.keyframe_insert(data_path="location", frame=start_frame)
            # Fraction of stance width, in metres. Prototype stride is ~0.2-0.3 m.
            root.location = (max(-0.04, min(0.04, shift * 0.03)), 0.0, 0.0)
            root.keyframe_insert(data_path="location", frame=mid)
            root.location = (0.0, 0.0, 0.0)
            root.keyframe_insert(data_path="location", frame=end_frame)
            keyed.append("weight-shift")
        for part in plan.get("overlap") or []:
            bone = _find_pose_bone(arm, str(part.get("part") or ""), str(part.get("part") or "").replace("_", ""))
            if bone is None:
                continue
            lag = int(part.get("lagFrames") or 2)
            decay = float(part.get("decay") or 0.5)
            peak = start_frame + max(1, lag)
            if _key_bone_euler(bone, start_frame, (0.0, 0.0, 0.0)) and _key_bone_euler(
                bone, min(end_frame, peak), (0.04 * decay, 0.0, 0.03 * decay)
            ):
                keyed.append(f"overlap:{bone.name}")
            _key_bone_euler(bone, end_frame, (0.0, 0.0, 0.0))
        roles[role] = {
            "applied": bool(keyed),
            "baseAction": plan.get("baseAction"),
            "gesture": plan.get("gesture"),
            "eyeLeadFrames": eye_lead,
            "headLeadFrames": head_lead,
            "keyed": keyed,
            "independentEyeAim": False,
        }
    return {"applied": any(entry.get("applied") for entry in roles.values()), "roles": roles}


def apply_direction_emotion(imported_by_role: dict, direction: dict | None, start_frame: int, end_frame: int, fps: int) -> dict:
    """Apply beat-level body posture from the emotion plan. Opt-in, bounded."""
    if not direction:
        return {"applied": False, "reason": "no direction block"}
    emotion = direction.get("emotion") or {}
    if not emotion:
        return {"applied": False, "reason": "direction block carries no emotion plan"}

    roles = {}
    for role, plan in emotion.items():
        objs = imported_by_role.get(role) or []
        arm = find_armature(objs)
        if arm is None:
            roles[role] = {"applied": False, "reason": "no armature"}
            continue
        _overlay_action(arm, role)
        effects = (plan.get("effects") or {}).get("body") or {}
        posture = float(effects.get("posture") or 0.0)
        energy = float(effects.get("energy") or 0.0)
        fidget = float(effects.get("fidget") or 0.0)
        spine = _find_pose_bone(arm, "spine", "chest")
        keyed = []
        transition = max(1, int(round(float(plan.get("transitionInSeconds") or 0.2) * fps)))
        settle = max(1, int(round(float(plan.get("settleSeconds") or 0.2) * fps)))
        peak = min(end_frame - settle, start_frame + transition)
        if spine is not None:
            pitch = max(-DDP_DIRECTION_MAX_BONE_RAD, min(DDP_DIRECTION_MAX_BONE_RAD, posture * 0.1))
            if _key_bone_euler(spine, start_frame, (0.0, 0.0, 0.0)) and _key_bone_euler(spine, peak, (pitch, 0.0, 0.0)):
                keyed.append("spine-posture")
            _key_bone_euler(spine, end_frame, (0.0, 0.0, 0.0))
        secondary = _find_pose_bone(arm, "comb", "tail", "ear_L", "backpack")
        if secondary is not None and fidget > 0:
            mid = (start_frame + end_frame) // 2
            amp = max(-DDP_DIRECTION_MAX_BONE_RAD, min(DDP_DIRECTION_MAX_BONE_RAD, fidget * 0.08 * (0.5 + energy)))
            if _key_bone_euler(secondary, start_frame, (0.0, 0.0, 0.0)) and _key_bone_euler(secondary, mid, (0.0, 0.0, amp)):
                keyed.append(f"fidget:{secondary.name}")
            _key_bone_euler(secondary, end_frame, (0.0, 0.0, 0.0))
        roles[role] = {
            "applied": bool(keyed),
            "primary": plan.get("primary"),
            "intensity": plan.get("intensity"),
            "keyed": keyed,
        }
    return {"applied": any(entry.get("applied") for entry in roles.values()), "roles": roles}


def apply_direction_face(imported_by_role: dict, direction: dict | None, fps: int) -> dict:
    """Apply non-viseme facial cues, blinks and rest recovery. Shape keys only."""
    if not direction:
        return {"applied": False, "reason": "no direction block"}
    face = direction.get("face") or {}
    facial = direction.get("facial") or {}
    if not face and not facial:
        return {"applied": False, "reason": "direction block carries no face plan"}

    roles = {}
    role_names = sorted(set(list(face.keys()) + list(facial.keys())))
    for role in role_names:
        objs = imported_by_role.get(role) or []
        mesh = _character_mesh(objs)
        plan = face.get(role) or {}
        cues = list(plan.get("cues") or facial.get(role) or [])
        for blink in plan.get("blinks") or []:
            at = int(blink.get("atMs") or 0)
            dur = int(blink.get("durationMs") or 120)
            cues.append({"channel": "blink", "startMs": at, "endMs": at + dur, "weight": 1.0, "source": "BLINK"})
        rest = plan.get("restRecovery")
        if rest:
            cues.append(
                {
                    "channel": rest.get("channel") or "viseme_REST",
                    "startMs": int(rest.get("atMs") or 0),
                    "endMs": int(rest.get("atMs") or 0) + 80,
                    "weight": float(rest.get("weight") or 1.0),
                    "source": "REST",
                }
            )
        applied = apply_facial_cues(mesh, cues, fps)
        gaze_applied = 0
        arm = find_armature(objs)
        if arm is not None and plan.get("gaze"):
            _overlay_action(arm, role)
            head = _find_pose_bone(arm, "head")
            for gaze in plan.get("gaze") or []:
                start = _ms_to_frame(gaze.get("startMs") or 0, fps)
                end = _ms_to_frame(gaze.get("endMs") or 0, fps)
                follow = float(gaze.get("headFollow") or 0.4)
                lead = int(round(int(gaze.get("eyeLeadMs") or 0) / 1000 * fps))
                yaw = max(-DDP_DIRECTION_MAX_BONE_RAD, min(DDP_DIRECTION_MAX_BONE_RAD, 0.08 * follow))
                if _key_bone_euler(head, max(1, start - max(0, lead)), (0.0, 0.0, 0.0)) and _key_bone_euler(
                    head, start, (0.02 * follow, 0.0, yaw)
                ):
                    gaze_applied += 1
                _key_bone_euler(head, end, (0.0, 0.0, 0.0))
        roles[role] = {
            "applied": applied > 0 or gaze_applied > 0,
            "cuesApplied": applied,
            "gazeApplied": gaze_applied,
            "expression": plan.get("expression"),
            "mesh": mesh.name if mesh else None,
        }
    return {"applied": any(entry.get("applied") for entry in roles.values()), "roles": roles}


def apply_direction_lighting(scene, direction: dict | None) -> dict:
    """Re-assert approved colour management and add motivated practicals.

    Does not retune key/fill/rim energies. Those live in LIGHTING_STATES and are
    the measured DAY_KEY / DAY_SOFT / GOLDEN_HOUR / OVERCAST rigs. A missing
    direction block is a no-op, so the accepted shot is unchanged.
    """
    import bpy

    if not direction:
        return {"applied": False, "reason": "no direction block"}
    lighting = direction.get("lighting") or {}
    if not lighting:
        return {"applied": False, "reason": "direction block carries no lighting plan"}

    view_transform = lighting.get("viewTransform") or "Khronos PBR Neutral"
    look = lighting.get("look") or "None"
    try:
        scene.view_settings.view_transform = view_transform
    except (TypeError, ValueError):
        pass
    try:
        scene.view_settings.look = look
    except (TypeError, ValueError):
        pass
    # Planner exposure is a relative stop offset around the measured state.
    # Only apply a non-zero offset so DAY_KEY (exposure 0) stays exactly the
    # measured rig the acceptance was graded on.
    exposure_offset = float(lighting.get("exposure") or 0.0)
    if abs(exposure_offset) > 1e-6:
        scene.view_settings.exposure = float(scene.view_settings.exposure) + max(-0.35, min(0.35, exposure_offset))

    created = []
    for practical in lighting.get("practicals") or []:
        source = str(practical.get("source") or "practical").replace(" ", "_")[:40]
        name = f"{DDP_PRACTICAL_PREFIX}{source}"
        if name in bpy.data.objects:
            continue
        energy = max(0.0, min(80.0, float(practical.get("relativeEnergy") or 0.2) * 40.0))
        light_data = bpy.data.lights.new(name=name, type="AREA")
        light_data.energy = energy
        light_data.size = 0.35
        if hasattr(light_data, "use_shadow"):
            light_data.use_shadow = False
        light_obj = bpy.data.objects.new(name, light_data)
        light_obj.location = (0.0, -2.1, 0.55)
        bpy.context.collection.objects.link(light_obj)
        created.append(name)

    return {
        "applied": True,
        "recipe": lighting.get("recipe"),
        "viewTransform": scene.view_settings.view_transform,
        "look": scene.view_settings.look,
        "exposure": scene.view_settings.exposure,
        "practicals": created,
    }


def _vfx_anchor_location(imported_by_role: dict, anchor: dict, layer: str) -> tuple[float, float, float]:
    kind = (anchor or {}).get("kind")
    ref = str((anchor or {}).get("ref") or "")
    loc = (0.0, -1.6, 0.6)
    if kind == "CHARACTER":
        role = "pip" if "PIP" in ref.upper() else "goat" if "GOAT" in ref.upper() else ref.lower()
        objs = imported_by_role.get(role) or []
        target = next((o for o in objs if o.type == "ARMATURE"), objs[0] if objs else None)
        if target is not None:
            loc = tuple(target.location)
            loc = (loc[0], loc[1], loc[2] + 0.55)
    elif kind == "PROP":
        objs = imported_by_role.get("map") or imported_by_role.get(ref.lower()) or []
        target = objs[0] if objs else None
        if target is not None:
            loc = tuple(target.location)
            loc = (loc[0], loc[1], loc[2] + 0.15)
    if layer == "BEHIND_SUBJECT":
        loc = (loc[0], loc[1] + 0.35, loc[2])
    elif layer == "FRONT_OF_SUBJECT":
        loc = (loc[0], loc[1] - 0.2, max(0.15, loc[2] * 0.5))
    return loc


def _seeded_unit(seed: int, index: int) -> float:
    """Deterministic 0..1 value. Same seed+index always yields the same float."""
    x = (int(seed) + index * 0x9E3779B9) & 0xFFFFFFFF
    x ^= (x << 13) & 0xFFFFFFFF
    x ^= x >> 17
    x ^= (x << 5) & 0xFFFFFFFF
    return (x & 0xFFFFFFFF) / 0xFFFFFFFF


def _new_emissive_ico(name: str, radius: float, location: tuple[float, float, float], mat):
    """Create an icosphere without bpy.ops so headless assembly stays context-safe."""
    import bmesh
    import bpy

    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    return obj


def _key_hide_render(obj, start_frame: int, visible_from: int, visible_until: int) -> None:
    obj.hide_render = True
    obj.keyframe_insert(data_path="hide_render", frame=max(start_frame, visible_from - 1))
    obj.hide_render = False
    obj.keyframe_insert(data_path="hide_render", frame=visible_from)
    obj.hide_render = True
    obj.keyframe_insert(data_path="hide_render", frame=visible_until)


def apply_direction_vfx(imported_by_role: dict, direction: dict | None, start_frame: int, end_frame: int, fps: int) -> dict:
    """Instantiate planned EEVEE VFX. Opt-in, bounded, no shadows, seeded."""
    import bpy

    if not direction:
        return {"applied": False, "reason": "no direction block"}
    instances = direction.get("vfx") or []
    if not instances:
        return {"applied": False, "reason": "direction block carries no vfx instances"}

    created = []
    for instance in instances:
        preset = str(instance.get("presetId") or "vfx")
        instance_id = str(instance.get("instanceId") or preset)
        seed = int(instance.get("seed") or 0)
        intensity = max(0.0, min(0.85, float(instance.get("intensity") or 0.4)))
        count = max(1, min(DDP_VFX_INSTANCE_CAP, int(instance.get("particleCount") or 8)))
        bounds = instance.get("boundsMeters") or {"x": 0.4, "y": 0.4, "z": 0.4}
        palette = list(instance.get("palette") or ["#FFE9A8"])
        layer = str(instance.get("layer") or "AROUND_SUBJECT")
        loc = _vfx_anchor_location(imported_by_role, instance.get("anchor") or {}, layer)
        f0 = _ms_to_frame(instance.get("startMs") or 0, fps, start_frame)
        f1 = min(
            end_frame,
            _ms_to_frame((instance.get("startMs") or 0) + (instance.get("durationMs") or 400), fps, start_frame),
        )
        color = _hex_rgb(palette[0])
        root_name = f"{DDP_VFX_PREFIX}{instance_id}"[:60]
        if root_name in bpy.data.objects:
            continue
        mat = bpy.data.materials.new(name=f"{root_name}_mat")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs[0].default_value = (*color, 1.0)
        emission.inputs[1].default_value = 1.2 + intensity * 2.0
        out = nodes.new("ShaderNodeOutputMaterial")
        links.new(emission.outputs[0], out.inputs[0])
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"
        root = _new_emissive_ico(root_name, 0.04, loc, mat)
        _key_hide_render(root, start_frame, f0, f1)
        spawned = [root.name]
        particle_like = any(token in preset for token in ("sparkle", "dust", "burst", "particle", "splash"))
        extra = count - 1 if particle_like else min(4, max(0, count - 1))
        for i in range(extra):
            ox = (_seeded_unit(seed, i * 3) - 0.5) * float(bounds.get("x") or 0.4)
            oy = (_seeded_unit(seed, i * 3 + 1) - 0.5) * float(bounds.get("y") or 0.4)
            oz = _seeded_unit(seed, i * 3 + 2) * float(bounds.get("z") or 0.4)
            mote = _new_emissive_ico(
                f"{root_name}_{i}",
                0.02 + 0.02 * _seeded_unit(seed, i + 99),
                (loc[0] + ox, loc[1] + oy, loc[2] + oz),
                mat,
            )
            _key_hide_render(mote, start_frame, f0, min(end_frame, f1 + i))
            spawned.append(mote.name)
        created.append(
            {
                "instanceId": instance_id,
                "presetId": preset,
                "objects": spawned,
                "seed": seed,
                "layer": layer,
            }
        )
    return {"applied": len(created) > 0, "instances": created}


def commit_direction_overlays(imported_by_role: dict) -> dict:
    """Park direction overlay actions on additive NLA tracks.

    Leaving a sparse overlay as the active action would REPLACE the authored
    performance (the motionless-goat failure mode). The overlay must ADD.
    """
    committed = []
    for role, objs in imported_by_role.items():
        arm = find_armature(objs)
        if arm is None or not arm.animation_data or not arm.animation_data.action:
            continue
        ad = arm.animation_data
        action = ad.action
        if not action.name.startswith("DDP_Direction_"):
            continue
        track = ad.nla_tracks.new()
        track.name = DDP_DIRECTION_NLA
        start = int(action.frame_range[0]) or 1
        strip = track.strips.new(action.name, start, action)
        strip.blend_type = "ADD"
        ad.action = None
        committed.append(role)
    return {"committed": committed}


# The authoritative lighting layer. One named key/fill/rim rig per state, with an
# explicit world strength, so exposure is deterministic and never accumulates.
#
# Energies are tuned against frame statistics measured on the bytes stored in the
# rendered PNG (see scripts/assets/png_io.py). Earlier tunings were steered by a
# loader that encoded already-encoded sRGB a second time and so over-reported
# brightness by ~1.77x: the rig this replaces measured "mean luma 147-154" but
# really stored 86-88/255, a third of range, which reads as overcast.
#
# What the numbers below are for:
#   * A SUN key at a widened angle, so the terminator is soft enough for a
#     children's short instead of stamping an ear onto a head as a hard patch.
#     It is strong enough to be the source of the picture: the sunlit trail
#     carries the top of the tonal range and every object throws a shadow the
#     audience can see, which is what puts the cast on the ground.
#   * An AREA fill from camera left at a real level. AgX crushed everything the
#     key missed toward black, and the old fill was two orders of magnitude too
#     weak to lift it; the fill raises the darkest 1% of the frame off the floor.
#   * A SPOT rim behind and above the characters, aimed at them. This is what
#     separates white fur from a green field. It was an area light until it was
#     measured: an area light behind the characters lights the field behind them
#     just as well, and pulling it close enough to rim them poured a bright pool
#     onto the grass they stand on. The ground around the goat measured 15 luma
#     BRIGHTER than open grass, its lit side sat 2 luma above the grass touching
#     its silhouette, and no ground shadow could read against the pool. Confining
#     the same light to a cone put the goat 86 luma above the grass, put 8 luma of
#     contact shadow under both characters, and cost the frame nothing it had any
#     business keeping.
#   * A low world strength, so nothing is lit by an untracked ambient term.
#   * "Khronos PBR Neutral" rather than AgX. AgX desaturates as it rolls off, so
#     every attempt to reach a 45-50% mean under it either washed the sky white
#     or tripped the saturation floor; PBR Neutral holds 60/128 mean saturation
#     at the same exposure.
#
# DAY_KEY is the measured reference state (it is what the acceptance shot uses)
# and lands mean luma 48-49% of range, p01 ~48, p99 209-218, zero clipped
# highlights, mean saturation ~62/128, both characters 75-87 luma above the grass
# touching them and 8-16 luma of shadow on the ground under them. The others
# follow the same shape and scale; only DAY_KEY is gated.
LIGHTING_STATES: dict[str, dict] = {
    "DAY_SOFT": {
        "world": {"color": (0.42, 0.62, 0.85), "strength": 0.20},
        "viewTransform": "Khronos PBR Neutral",
        "look": "None",
        "exposure": -3.1,
        "sky": {
            "color": (0.18, 0.47, 0.93),
            "midColor": (0.36, 0.64, 0.96),
            "horizonColor": (0.74, 0.86, 0.98),
            "horizonAt": 0.46,
            "midAt": 0.60,
            "zenithAt": 0.90,
            "strength": 2.4,
        },
        "key": {
            "type": "SUN",
            "energy": 19.0,
            "angle": 0.20,
            "location": (4.0, -5.0, 9.0),
            "rotation": (0.72, 0.12, 0.5),
        },
        "fill": {"type": "AREA", "energy": 165.0, "size": 6.0, "location": (-3.2, -4.6, 3.4)},
        "rim": {
            "type": "SPOT",
            "energy": 800.0,
            "spotSize": 0.85,
            "spotBlend": 0.55,
            "radius": 0.5,
            "location": (0.7, 1.4, 2.9),
            "target": (0.05, -1.5, 0.55),
        },
    },
    "DAY_KEY": {
        "world": {"color": (0.40, 0.60, 0.84), "strength": 0.18},
        "viewTransform": "Khronos PBR Neutral",
        "look": "None",
        "exposure": -3.1,
        # Measured on the widest framing, which shows the most sky and is the
        # worst case for saturation: a near-white horizon band looks like haze but
        # costs 3 points of frame saturation and 5% of mean luma, so the ramp stays
        # a saturated blue that only lightens toward the horizon.
        #
        # Sky strength is also how the frame mean is centred. The sky covers about
        # 40% of this framing and sits below the frame mean, so it moves the mean
        # without touching the top of the range: dropping it from 3.2 to 2.6 took
        # mean luma from 49.3% to 48.1% of range and gained 1.7 points of frame
        # saturation, while the 99th percentile did not move at all.
        "sky": {
            "color": (0.11, 0.36, 0.90),
            "midColor": (0.22, 0.52, 0.95),
            "horizonColor": (0.40, 0.68, 0.98),
            "horizonAt": 0.46,
            "midAt": 0.60,
            "zenithAt": 0.90,
            "strength": 2.6,
        },
        # Sunlight, at the level where it does the job a sun does. At 9 W/m2 the
        # field was lit mostly by the rim and nothing cast a shadow worth seeing:
        # the ground under the goat's hooves darkened by 1.9 luma over 7% of the
        # area, against 9.2 over 31% at the base of the tree. Raising the sun is
        # what makes the trail the brightest large surface in frame, and it is why
        # the shadow sample budget in set_eevee had to go up with it.
        "key": {
            "type": "SUN",
            "energy": 25.0,
            "angle": 0.14,
            "location": (3.4, -4.4, 9.0),
            "rotation": (0.66, 0.1, 0.42),
        },
        "fill": {"type": "AREA", "energy": 130.0, "size": 5.0, "location": (-3.4, -4.2, 3.0)},
        # A cone from behind and above, aimed between the characters at the
        # height of their shoulders, wide enough to hold both of them and no more.
        "rim": {
            "type": "SPOT",
            "energy": 900.0,
            "spotSize": 0.72,
            "spotBlend": 0.4,
            "radius": 0.4,
            "location": (0.6, 1.2, 2.8),
            "target": (0.05, -1.5, 0.55),
        },
    },
    "GOLDEN_HOUR": {
        "world": {"color": (0.52, 0.42, 0.32), "strength": 0.16},
        "viewTransform": "Khronos PBR Neutral",
        "look": "None",
        "exposure": -3.0,
        "sky": {
            "color": (0.72, 0.40, 0.30),
            "midColor": (0.95, 0.52, 0.24),
            "horizonColor": (1.0, 0.78, 0.46),
            "horizonAt": 0.46,
            "midAt": 0.60,
            "zenithAt": 0.90,
            "strength": 2.2,
        },
        "key": {
            "type": "SUN",
            "energy": 20.0,
            "angle": 0.16,
            "location": (-5.5, -3.0, 3.2),
            "rotation": (1.18, 0.0, -0.75),
        },
        "fill": {"type": "AREA", "energy": 100.0, "size": 6.0, "location": (3.0, -4.0, 2.4)},
        "rim": {
            "type": "SPOT",
            "energy": 950.0,
            "spotSize": 0.78,
            "spotBlend": 0.45,
            "radius": 0.45,
            "location": (0.8, 1.3, 2.7),
            "target": (0.05, -1.5, 0.55),
        },
    },
    "OVERCAST": {
        "world": {"color": (0.55, 0.58, 0.62), "strength": 0.34},
        "viewTransform": "Khronos PBR Neutral",
        "look": "None",
        "exposure": -2.9,
        "sky": {
            "color": (0.60, 0.66, 0.74),
            "midColor": (0.70, 0.75, 0.80),
            "horizonColor": (0.86, 0.88, 0.90),
            "horizonAt": 0.46,
            "midAt": 0.60,
            "zenithAt": 0.90,
            "strength": 2.4,
        },
        "key": {
            "type": "SUN",
            "energy": 9.5,
            "angle": 0.35,
            "location": (2.0, -4.0, 10.0),
            "rotation": (0.5, 0.0, 0.2),
        },
        "fill": {"type": "AREA", "energy": 210.0, "size": 8.0, "location": (-2.0, -4.0, 4.0)},
        # Overcast has no sun to rim against, so the cone is wide and gentle: just
        # enough edge to keep the characters off the background.
        "rim": {
            "type": "SPOT",
            "energy": 400.0,
            "spotSize": 1.05,
            "spotBlend": 0.7,
            "radius": 0.8,
            "location": (0.4, 1.6, 3.0),
            "target": (0.05, -1.5, 0.55),
        },
    },
}
DEFAULT_LIGHTING_STATE = "DAY_SOFT"
# Every light this layer owns carries this prefix, so re-running assembly
# replaces its own rig instead of stacking a second one.
DDP_LIGHT_PREFIX = "DDP_"


def resolve_lighting_state(requested: str | None) -> str:
    state = str(requested or "").strip().upper().replace("-", "_").replace(" ", "_")
    return state if state in LIGHTING_STATES else DEFAULT_LIGHTING_STATE


def key_light_direction(requested: str | None):
    """The world-space direction the key light of a lighting state travels.

    Read from the state table rather than from the scene, because the shadow
    casters are built while the characters are imported and the lights are
    installed afterwards. A sun shines down its own -Z.
    """
    from mathutils import Euler, Vector

    spec = LIGHTING_STATES[resolve_lighting_state(requested)]["key"]
    rotation = Euler(tuple(spec.get("rotation", (0.0, 0.0, 0.0))), "XYZ")
    direction = Vector((0.0, 0.0, -1.0))
    direction.rotate(rotation)
    return direction.normalized()


def apply_sky_emission(spec: dict) -> list[str]:
    """Make environment sky domes self-lit.

    A sky dome is a plain diffuse mesh, so its brightness otherwise depends on
    whichever lights happen to reach it: lowering the fill to get real shadows
    turned the meadow's sky navy and the whole shot read as dusk. Driving it from
    the lighting state keeps the sky bright and deterministic no matter how the
    key/fill/rim rig is tuned.
    """
    import bpy

    sky = spec.get("sky")
    if not sky:
        return []
    material = bpy.data.materials.get("DDP_Sky") or bpy.data.materials.new("DDP_Sky")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs[1].default_value = sky["strength"]
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(emission.outputs[0], out.inputs[0])

    # A single flat colour across the whole dome is the giveaway of an unlit
    # background: real sky lightens and warms toward the horizon, and that
    # gradient is what separates a green field from the air above it.
    horizon = sky.get("horizonColor")
    if horizon:
        coords = nodes.new("ShaderNodeTexCoord")
        split = nodes.new("ShaderNodeSeparateXYZ")
        ramp = nodes.new("ShaderNodeValToRGB")
        links.new(coords.outputs["Generated"], split.inputs[0])
        links.new(split.outputs["Z"], ramp.inputs[0])
        elements = ramp.color_ramp.elements
        elements[0].position = float(sky.get("horizonAt", 0.48))
        elements[0].color = (*horizon, 1.0)
        elements[1].position = float(sky.get("zenithAt", 0.92))
        elements[1].color = (*sky["color"], 1.0)
        mid = ramp.color_ramp.elements.new(float(sky.get("midAt", 0.62)))
        mid.color = (*sky.get("midColor", sky["color"]), 1.0)
        links.new(ramp.outputs["Color"], emission.inputs[0])
    else:
        emission.inputs[0].default_value = (*sky["color"], 1.0)

    applied = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or "sky" not in obj.name.lower():
            continue
        obj.data.materials.clear()
        obj.data.materials.append(material)
        # The meadow's sky is a radius-40 dome that ENCLOSES the whole set,
        # including the lights. As a shadow caster it blocked the sun completely:
        # measured with raytraced shadows on, driving the key light from 8.5 to
        # 500 W/m2 changed mean frame luma by 0.01, because every ray was stopped
        # by the dome overhead. A background dome must never occlude the key.
        if hasattr(obj, "visible_shadow"):
            obj.visible_shadow = False
        applied.append(obj.name)
    return applied


def apply_lighting_state(scene, requested: str | None) -> dict:
    """Install exactly one deterministic key/fill/rim rig plus world strength."""
    import bpy

    state_name = resolve_lighting_state(requested)
    spec = LIGHTING_STATES[state_name]

    world = scene.world or bpy.data.worlds.new("DDP_World")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new(type="ShaderNodeBackground")
    bg.inputs[0].default_value = (*spec["world"]["color"], 1.0)
    bg.inputs[1].default_value = spec["world"]["strength"]
    out = nodes.new(type="ShaderNodeOutputWorld")
    links.new(bg.outputs[0], out.inputs[0])

    # Idempotent: clear any rig this layer previously created.
    for obj in [o for o in bpy.data.objects if o.type == "LIGHT" and o.name.startswith(DDP_LIGHT_PREFIX)]:
        bpy.data.objects.remove(obj, do_unlink=True)

    created = []
    for role in ("key", "fill", "rim"):
        cfg = spec[role]
        name = f"{DDP_LIGHT_PREFIX}{role.capitalize()}"
        light_data = bpy.data.lights.new(name=name, type=cfg["type"])
        light_data.energy = cfg["energy"]
        if cfg["type"] == "AREA" and "size" in cfg:
            light_data.size = cfg["size"]
        # A sun at its default 0.5-degree angle throws razor-sharp shadows, so an
        # ear reads as a painted patch on the head. Widening it softens the
        # terminator into something a children's short can use.
        if cfg["type"] == "SUN" and "angle" in cfg:
            light_data.angle = cfg["angle"]
        # A cone, for a rim that has to stay on the characters. An area light
        # behind them lights whatever else is behind them just as well, so the
        # field it spills onto rises with the edge it is meant to separate.
        if cfg["type"] == "SPOT":
            if "spotSize" in cfg:
                light_data.spot_size = cfg["spotSize"]
            if "spotBlend" in cfg:
                light_data.spot_blend = cfg["spotBlend"]
            if "radius" in cfg:
                light_data.shadow_soft_size = cfg["radius"]
        # Only the key casts. The characters and props are joined primitives, so
        # spheres intersect inside the silhouette; every extra shadow map stipples
        # those intersections with self-shadow acne that reads as dirt on white
        # fur and survives any number of render samples. Fill and rim stand in for
        # bounce light, which does not cast in the first place.
        if hasattr(light_data, "use_shadow"):
            light_data.use_shadow = bool(cfg.get("shadow", role == "key"))
        if hasattr(light_data, "shadow_buffer_bias") and "shadowBias" in cfg:
            light_data.shadow_buffer_bias = cfg["shadowBias"]
        light_obj = bpy.data.objects.new(name, light_data)
        light_obj.location = cfg["location"]
        if "rotation" in cfg:
            light_obj.rotation_euler = cfg["rotation"]
        # Aiming beats hand-written Euler angles for anything that has to hit a
        # specific place in the set: move the light and it still points at the
        # characters, so a tuning pass cannot silently leave it facing the field.
        if "target" in cfg:
            import mathutils

            direction = mathutils.Vector(cfg["target"]) - mathutils.Vector(cfg["location"])
            light_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(light_obj)
        created.append(name)

    # Tone mapping is part of the lighting state, not a default inherited from
    # whatever Blender happens to ship: the view transform decides how much
    # colour survives, and leaving it implicit is how a shot ends up graded
    # differently from the one that was approved.
    scene.view_settings.exposure = float(spec.get("exposure", 0.0))
    view_transform = spec.get("viewTransform")
    if view_transform:
        try:
            scene.view_settings.view_transform = view_transform
        except (TypeError, ValueError):  # not in this build's OCIO config
            pass
    look = spec.get("look") or "None"
    look_applied = None
    try:
        scene.view_settings.look = look
        look_applied = scene.view_settings.look
    except (TypeError, ValueError):  # look unavailable in this build's OCIO config
        look_applied = scene.view_settings.look

    sky_objects = apply_sky_emission(spec)

    total = [o.name for o in bpy.data.objects if o.type == "LIGHT"]
    return {
        "skyObjects": sky_objects,
        "lightingState": state_name,
        "requested": requested or None,
        "created": created,
        "activeLightCount": len(total),
        "activeLights": sorted(total),
        "worldStrength": spec["world"]["strength"],
        "look": look_applied,
        "lookRequested": look,
        "exposure": scene.view_settings.exposure,
        "viewTransform": scene.view_settings.view_transform,
    }


# Surface response, applied by the shot rather than baked into each asset so the
# whole cast and set stay consistent and one edit fixes all of them.
#
# The founding assets were authored as flat matte shaders at roughness 0.4-0.85
# with the specular input near zero, which is why the acceptance render read as
# untextured plastic: nothing anywhere in frame returned a highlight, so there
# was no cue for shape or material. These values are deliberately restrained —
# eyes and wet surfaces glint, fur and foliage stay soft — and every entry is
# keyed on a substring of the material name.
MATERIAL_POLISH: list[tuple[tuple[str, ...], dict]] = [
    (("catchlight",), {"roughness": 0.08, "specular": 1.0, "emission": (1.0, 1.0, 1.0), "emissionStrength": 2.6}),
    (("pupil",), {"roughness": 0.12, "specular": 0.85}),
    (("iris",), {"roughness": 0.16, "specular": 0.8}),
    (("eyewhite",), {"roughness": 0.22, "specular": 0.7}),
    (("nose", "beak"), {"roughness": 0.30, "specular": 0.6}),
    (("horn", "hoof"), {"roughness": 0.42, "specular": 0.45}),
    (("tag", "charm"), {"roughness": 0.28, "specular": 0.7}),
    (("collar", "backpack", "pouch"), {"roughness": 0.55, "specular": 0.35}),
    (("comb", "brow", "ear"), {"roughness": 0.52, "specular": 0.35}),
    (("body", "feet"), {"roughness": 0.62, "specular": 0.32}),
    # Bump scales are in object-space cycles per metre: paper fibre is sub-
    # millimetre, dirt and rock are a few centimetres.
    (("mappaper", "mapfold"), {"roughness": 0.66, "specular": 0.28, "bump": (260.0, 0.06)}),
    (("mapwater",), {"roughness": 0.18, "specular": 0.9}),
    (("mapink", "mapcoast", "maptrail", "mapaccent"), {"roughness": 0.48, "specular": 0.35}),
    (("mapstone", "bark"), {"roughness": 0.82, "specular": 0.18, "bump": (18.0, 0.28)}),
    (("grass", "path"), {"roughness": 0.88, "specular": 0.16, "bump": (22.0, 0.14)}),
    (("leaf",), {"roughness": 0.74, "specular": 0.22, "bump": (14.0, 0.16)}),
    (("flower",), {"roughness": 0.45, "specular": 0.4}),
]


def _principled(material):
    if not material.use_nodes:
        return None
    return next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def _set_input(node, names: tuple[str, ...], value) -> bool:
    for name in names:
        if name in node.inputs:
            node.inputs[name].default_value = value
            return True
    return False


def _add_bump(material, bsdf, scale: float, strength: float) -> None:
    """Break up a flat shader with fine procedural relief.

    Cheap in EEVEE and it is what stops grass, paper and rock from reading as
    coloured plastic under a highlight.

    The noise is driven from object coordinates, not the default generated ones.
    Generated coordinates normalise to each object's bounding box, so the same
    noise stretched along whatever axis an object happened to be longest: on the
    dirt path and the map's paper it drew centimetre-wide streaks down the length
    of the mesh and both read as varnished wood at full resolution.
    """
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    if any(n.name == "DDP_Bump" for n in nodes):
        return
    coords = nodes.new("ShaderNodeTexCoord")
    coords.name = "DDP_BumpCoords"
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "DDP_BumpNoise"
    noise.inputs["Scale"].default_value = scale
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    if "Detail" in noise.inputs:
        noise.inputs["Detail"].default_value = 4.0
    bump = nodes.new("ShaderNodeBump")
    bump.name = "DDP_Bump"
    bump.inputs["Strength"].default_value = strength
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def apply_material_polish() -> dict:
    """Give every material a deliberate, restrained surface response."""
    import bpy

    touched: dict[str, str] = {}
    for material in bpy.data.materials:
        if material.name.startswith("DDP_"):
            continue  # owned by the lighting layer
        bsdf = _principled(material)
        if bsdf is None:
            continue
        lowered = material.name.lower()
        spec = next((cfg for keys, cfg in MATERIAL_POLISH if any(k in lowered for k in keys)), None)
        if spec is None:
            continue
        _set_input(bsdf, ("Roughness",), spec["roughness"])
        _set_input(bsdf, ("Specular IOR Level", "Specular"), spec["specular"])
        if "emission" in spec:
            _set_input(bsdf, ("Emission Color", "Emission"), (*spec["emission"], 1.0))
            _set_input(bsdf, ("Emission Strength",), spec["emissionStrength"])
        if "bump" in spec:
            _add_bump(material, bsdf, *spec["bump"])
        touched[material.name] = f"roughness={spec['roughness']} specular={spec['specular']}" + (
            " +bump" if "bump" in spec else ""
        ) + (" +emission" if "emission" in spec else "")
    return {"count": len(touched), "materials": touched}


def parse_resolution(value: str) -> tuple[int, int]:
    w, h = value.lower().split("x")
    return int(w), int(h)


def main() -> None:
    import bpy

    parser = argparse.ArgumentParser(description="Assemble and render a production shot.")
    parser.add_argument("--scene-id", required=True)
    parser.add_argument(
        "--resolution",
        choices=["270x480", "360x640", "540x960", "720x1280", "1080x1920"],
        default="540x960",
    )
    parser.add_argument("--fps", type=int, choices=[24, 30, 60], default=30)
    parser.add_argument("--engine", choices=["EEVEE", "CYCLES"], default="EEVEE")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--assets-json", default="[]")
    parser.add_argument("--start-frame", type=int, default=1)
    parser.add_argument("--end-frame", type=int, default=0)
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--camera-preset", default="WIDE")
    parser.add_argument("--shot-meta-json", default="{}")
    parser.add_argument(
        "--shot-meta",
        default="",
        help="Optional path to a shot_meta JSON file. Preferred over --shot-meta-json when set.",
    )
    parser.add_argument(
        "--assets-json-file",
        default="",
        help="Optional path to an assets JSON list. Preferred over --assets-json when set.",
    )
    args = parse_blender_args(parser)

    if args.assets_json_file:
        assets = json.loads(Path(args.assets_json_file).read_text())
    else:
        assets = json.loads(args.assets_json)
    if not isinstance(assets, list):
        emit("INVALID_ARGUMENT", "assets-json must decode to a list.")
        raise SystemExit(2)

    missing = []
    for asset in assets:
        local_path = asset.get("localPath") if isinstance(asset, dict) else None
        role = asset.get("role", "asset") if isinstance(asset, dict) else "asset"
        try:
            require_asset(local_path, role)
        except SystemExit:
            missing.append({"role": role, "path": local_path})
    if missing:
        emit("MISSING_ASSET", "One or more scene assets are missing.", missing=missing)
        raise SystemExit(2)

    if args.shot_meta:
        shot_meta = json.loads(Path(args.shot_meta).read_text())
    else:
        shot_meta = json.loads(args.shot_meta_json) if args.shot_meta_json else {}
    width, height = parse_resolution(args.resolution)
    fps = args.fps
    end_frame = args.end_frame if args.end_frame > 0 else int(shot_meta.get("endFrame") or 45)
    start_frame = args.start_frame

    built = build_scene(
        assets=assets,
        shot_meta=shot_meta,
        width=width,
        height=height,
        fps=fps,
        start_frame=start_frame,
        end_frame=end_frame,
        camera_preset=args.camera_preset or shot_meta.get("cameraPreset") or "WIDE",
        engine=args.engine,
        samples=args.samples,
    )
    scene = bpy.context.scene
    lighting = built["lighting"]
    stripped = built["stripped"]
    roots = built["placementRoots"]
    applied_actions = built["appliedActions"]
    imported_by_role = built["importedByRole"]

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(out_dir / "frame_")

    emit(
        "OK",
        "Scene assembled; beginning EEVEE frame render.",
        sceneId=args.scene_id,
        resolution=args.resolution,
        fps=fps,
        engine=scene.render.engine,
        frames=[start_frame, end_frame],
        roles=sorted(imported_by_role.keys()),
        lighting=lighting,
        strippedFromAssets=stripped,
        placementRoots=roots,
        appliedActions=applied_actions,
    )
    bpy.ops.render.render(animation=True)
    frame_count = len(list(out_dir.glob("frame_*.png")))
    meta = {
        "ok": True,
        "sceneId": args.scene_id,
        "resolution": args.resolution,
        "fps": fps,
        "engine": scene.render.engine,
        "frameCount": frame_count,
        "outputDir": str(out_dir),
        "lighting": lighting,
        "strippedFromAssets": stripped,
        "placementRoots": roots,
        "appliedActions": applied_actions,
    }
    (out_dir / "assemble_meta.json").write_text(json.dumps(meta, indent=2))
    emit("RENDER_OK", "Frames rendered.", **meta)


def build_scene(
    assets: list,
    shot_meta: dict,
    width: int,
    height: int,
    fps: int,
    start_frame: int,
    end_frame: int,
    camera_preset: str,
    engine: str = "EEVEE",
    samples: int = 24,
) -> dict:
    """Construct the production shot. Shared by the renderer and the QC gates."""
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.frame_start = start_frame
    scene.frame_end = end_frame

    imported_by_role: dict[str, list] = {}
    for asset in assets:
        role = str(asset.get("id") or asset.get("role") or "other")
        local_path = asset["localPath"]
        objs = append_object(local_path)
        imported_by_role.setdefault(role, []).extend(objs)

    keep_imported = bool(shot_meta.get("keepImportedLights"))
    stripped = {"lights": [], "cameras": []}
    if not keep_imported:
        for role in list(imported_by_role):
            result = strip_imported_lights_and_cameras(imported_by_role[role])
            stripped["lights"].extend(result["lights"])
            stripped["cameras"].extend(result["cameras"])
            imported_by_role[role] = [
                bpy.data.objects[name] for name in result["survivors"] if name in bpy.data.objects
            ]

    # Position characters if metadata provides offsets
    placements = shot_meta.get("placements") or {}
    missing_actions = []
    applied_actions = {}
    roots = {}
    shadow_proxies: list[str] = []
    key_direction = key_light_direction(shot_meta.get("lightingState"))
    for role, objs in imported_by_role.items():
        arm = find_armature(objs)
        target, root_kind = placement_root(role, objs)
        if not target:
            continue
        roots[role] = {"object": target.name, "kind": root_kind}
        place = placements.get(role) or {}
        if "location" in place:
            target.location = tuple(place["location"])
        if "rotation" in place:
            target.rotation_euler = tuple(place["rotation"])
        action = place.get("action") or (shot_meta.get("actions") or {}).get(role)
        if action:
            if apply_action(arm, action, start_frame, end_frame):
                applied_actions[role] = action
            else:
                missing_actions.append({"role": role, "action": action})
        mesh = next((o for o in objs if o.type == "MESH" and "Character" in o.name), None)
        if mesh is None:
            mesh = next((o for o in objs if o.type == "MESH"), None)
        cues = (shot_meta.get("lipSync") or {}).get(role) or []
        if mesh and cues:
            apply_viseme_cues(mesh, cues, fps)
        # Only the characters need this: they are the assets built from stacked
        # primitives, and they are the ones the audience looks at.
        if arm is not None:
            shadow_proxies.extend(install_shadow_proxy(objs, light=key_direction))

    # Fail closed: silently dropping a requested action is what let the first
    # acceptance render ship with a completely motionless goat.
    if missing_actions:
        emit(
            "MISSING_ACTION",
            "One or more requested actions do not exist in the supplied assets.",
            missing=missing_actions,
            available=sorted(a.name for a in bpy.data.actions),
        )
        raise SystemExit(2)

    lighting = apply_lighting_state(scene, shot_meta.get("lightingState"))
    materials = apply_material_polish()
    configure_camera(scene, camera_preset, width, height)
    # Opt-in overrides, after the presets so they refine rather than compete.
    # Each consumer no-ops when shot_meta has no direction block.
    direction = shot_meta.get("direction")
    direction_lighting = apply_direction_lighting(scene, direction)
    direction_camera = apply_direction_camera(scene, direction)
    direction_acting = apply_direction_acting(imported_by_role, direction, start_frame, end_frame, fps)
    direction_emotion = apply_direction_emotion(imported_by_role, direction, start_frame, end_frame, fps)
    direction_face = apply_direction_face(imported_by_role, direction, fps)
    direction_vfx = apply_direction_vfx(imported_by_role, direction, start_frame, end_frame, fps)
    direction_overlays = commit_direction_overlays(imported_by_role)
    if str(engine).upper() == "EEVEE":
        set_eevee(scene, samples)
    else:
        scene.render.engine = "CYCLES"

    return {
        "importedByRole": imported_by_role,
        "lighting": lighting,
        "materials": materials,
        "shadowProxies": shadow_proxies,
        "stripped": stripped,
        "placementRoots": roots,
        "appliedActions": applied_actions,
        "directionCamera": direction_camera,
        "directionLighting": direction_lighting,
        "directionActing": direction_acting,
        "directionEmotion": direction_emotion,
        "directionFace": direction_face,
        "directionVfx": direction_vfx,
        "directionOverlays": direction_overlays,
    }


if __name__ == "__main__":
    main()

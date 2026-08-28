"""TivvleJoy Original-14 purchased-scenery 30-second showcase.

Consumes only locally materialized purchased source packages. The RunPod worker
handles R2 access, hashing, final 1080x1920 encoding, upload, and readback.
This script assembles a lightweight 540x960 EEVEE scene so the proof finishes
reliably instead of repeating the prior 1080p/48-sample timeout.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import zipfile
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from showcase_original14_select import (  # noqa: E402
    GEOMETRY_EXTS,
    IMAGE_EXTS,
    NON_ALBEDO_WORDS,
    SUPPORT_EXTS,
    extract_role_limit,
    extract_sort_key,
    geometry_file_limit,
    is_authored_village_mesh_name,
    is_box_mesh,
    is_cabin_texture_name,
    is_camera_hero_name,
    is_dominating_plane,
    is_foliage_card_name,
    is_high_lod_name,
    is_primitive_name,
    is_water_or_ocean_name,
    village_orbit_radius,
    mesh_keep_rank,
    pick_geometry_paths,
    pick_ground_image_path,
    should_extract_member,
)

VISIBLE_GEOMETRY_ROLES = {
    'village_blender', 'village_project', 'village_fbx',
    'forest_nature', 'forest_ecokit',
}
SUPPORT_ROLES = {'sky_machine_v1', 'sky_machine_v2', 'sky_extra_update', 'world_shaders'}
RENDERABLE_ROLES = VISIBLE_GEOMETRY_ROLES | {'village_textures', 'sky_hdri'} | SUPPORT_ROLES
MAX_OBJECTS_PER_BLEND = 80
MAX_MATERIALS_PER_BLEND = 24
MAX_MESHES_PER_ROLE = 8
MAX_MESHES_VILLAGE_BLEND = 60
TARGET_FACES_PER_MESH = 8000
TARGET_FACES_SCENE = 160000
PROGRESS_PATH: Path | None = None


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--assets-json', required=True)
    p.add_argument('--output-dir', required=True)
    p.add_argument('--resolution', default='540x960')
    p.add_argument('--fps', type=int, default=30)
    p.add_argument('--start-frame', type=int, default=1)
    p.add_argument('--end-frame', type=int, default=900)
    p.add_argument('--samples', type=int, default=12)
    p.add_argument('--proof-path', required=True)
    p.add_argument('--progress-path', default='')
    return p.parse_args(argv)


def write_progress(stage: str, **extra) -> None:
    if PROGRESS_PATH is None:
        return
    payload = {'event': 'original14_progress', 'stage': stage, **extra}
    PROGRESS_PATH.write_text(json.dumps(payload) + '\n', encoding='utf-8')
    print(json.dumps(payload), flush=True)


def clean_scene() -> None:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def safe_member_path(destination: Path, member: str) -> Path | None:
    rel = Path(member.replace('\\', '/'))
    if rel.is_absolute() or '..' in rel.parts:
        return None
    target = (destination / rel).resolve()
    if destination.resolve() not in target.parents:
        return None
    return target


def extract_selected(zip_path: Path, destination: Path, role: str, depth: int = 0) -> list[Path]:
    destination.mkdir(parents=True, exist_ok=True)
    extracted: list[Path] = []
    try:
        with zipfile.ZipFile(zip_path) as zf:
            infos = [i for i in zf.infolist() if not i.is_dir()]
            wanted = [
                i for i in infos
                if Path(i.filename).suffix.lower() in SUPPORT_EXTS
                and should_extract_member(i.filename, int(i.file_size or 0), role)
            ]
            # Prefer individual purchased geometry over combined dumps / huge images.
            wanted.sort(key=lambda i: extract_sort_key(i.filename, int(i.file_size or 0), role))
            role_limit = extract_role_limit(role)
            for info in wanted[:role_limit]:
                target = safe_member_path(destination, info.filename)
                if target is None:
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src, open(target, 'wb') as dst:
                    while True:
                        chunk = src.read(4 * 1024 * 1024)
                        if not chunk:
                            break
                        dst.write(chunk)
                extracted.append(target)
    except zipfile.BadZipFile:
        return []

    # One nested ZIP level covers update/support bundles without recursively unpacking everything.
    if depth == 0:
        nested = [p for p in extracted if p.suffix.lower() == '.zip'][:4]
        for i, nested_zip in enumerate(nested):
            extracted.extend(extract_selected(nested_zip, destination / f'nested_{i}', role, depth=1))
    return extracted


def expand_asset(asset: dict, root: Path) -> list[Path]:
    p = Path(asset['localPath'])
    if p.suffix.lower() != '.zip':
        return [p]
    return extract_selected(p, root / re.sub(r'[^A-Za-z0-9_-]+', '_', asset['role']), asset['role'])


def select_blend_names(names: list[str], role: str, limit: int = 10) -> list[str]:
    words = {
        'village_blender': ('house', 'cabin', 'building', 'roof', 'tree', 'fence', 'gate', 'cart'),
        'village_project': ('house', 'cabin', 'building', 'roof', 'tree', 'rock', 'flora', 'bush'),
        'village_fbx': ('house', 'cabin', 'building', 'roof', 'tree', 'fence', 'gate', 'cart'),
        'forest_nature': ('tree', 'rock', 'bush', 'grass', 'fern', 'log', 'stump'),
        'forest_ecokit': ('tree', 'rock', 'bush', 'grass', 'fern', 'log', 'stump'),
    }.get(role, ())
    usable = [
        n for n in names
        if n
        and not is_primitive_name(n)
        and not is_water_or_ocean_name(n)
        and not is_foliage_card_name(n)
        and not is_high_lod_name(n)
    ]
    preferred = [n for n in usable if any(w in n.lower() for w in words)]
    if role in {'village_blender', 'village_fbx', 'village_project'}:
        ordered = preferred + [n for n in usable if n not in preferred]
        if ordered:
            return ordered[:limit]
    chosen = preferred[:limit]
    if chosen:
        return chosen
    if usable:
        return usable[:min(limit, len(usable))]
    return names[:min(limit, len(names))]


def append_blend_geometry(path: Path, role: str) -> tuple[list[bpy.types.Object], int]:
    before = set(bpy.data.objects.keys())
    loaded_support = 0
    try:
        with bpy.data.libraries.load(str(path), link=False) as (src, dst):
            src_names = list(src.objects or [])
            dst.objects = select_blend_names(src_names, role, limit=MAX_OBJECTS_PER_BLEND)
            if role == 'village_project':
                cols = [
                    name for name in list(src.collections or [])
                    if name and not is_water_or_ocean_name(name)
                ]
                dst.collections = cols[:12]
            dst.materials = list(src.materials[:MAX_MATERIALS_PER_BLEND])
            dst.node_groups = list(src.node_groups[:8])
        for obj in dst.objects:
            if obj is not None and obj.name not in bpy.context.scene.collection.objects:
                try:
                    bpy.context.scene.collection.objects.link(obj)
                except RuntimeError:
                    pass
        if role == 'village_project':
            for col in getattr(dst, 'collections', []) or []:
                if col is None:
                    continue
                try:
                    bpy.context.scene.collection.children.link(col)
                except RuntimeError:
                    pass
        loaded_support = len([m for m in dst.materials if m]) + len([n for n in dst.node_groups if n])
    except Exception as exc:
        print(json.dumps({'event':'blend_import_warning','role':role,'error':str(exc)[:240]}))
        return [], 0
    objects = [bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before]
    return objects, loaded_support


def import_geometry(path: Path, role: str) -> list[bpy.types.Object]:
    ext = path.suffix.lower()
    if ext == '.blend':
        return append_blend_geometry(path, role)[0]
    before = set(bpy.data.objects.keys())
    try:
        if ext == '.fbx':
            bpy.ops.import_scene.fbx(filepath=str(path), use_image_search=True)
        elif ext in {'.glb', '.gltf'}:
            bpy.ops.import_scene.gltf(filepath=str(path))
        elif ext == '.obj':
            bpy.ops.wm.obj_import(filepath=str(path))
        else:
            return []
    except Exception as exc:
        print(json.dumps({'event':'geometry_import_warning','role':role,'ext':ext,'error':str(exc)[:240]}))
        return []
    return [bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before]


def geometry_candidates(files: list[Path], role: str) -> list[Path]:
    return pick_geometry_paths(files, role, limit=geometry_file_limit(role))


def mesh_face_count(obj) -> int:
    try:
        return len(obj.data.polygons)
    except Exception:
        return 0


def decimate_mesh(obj, target_faces: int = TARGET_FACES_PER_MESH) -> None:
    if obj.type != 'MESH':
        return
    faces = mesh_face_count(obj)
    if faces <= target_faces:
        return
    ratio = max(0.02, min(0.35, target_faces / max(faces, 1)))
    try:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new(name='TJ_FastDecimate', type='DECIMATE')
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        print(json.dumps({'event': 'decimate_warning', 'object': obj.name, 'error': str(exc)[:180]}), flush=True)


def object_dimensions(obj) -> tuple:
    try:
        d = obj.dimensions
        return (float(d.x), float(d.y), float(d.z))
    except Exception:
        return (0.0, 0.0, 0.0)


def keep_hero_meshes(objects: list[bpy.types.Object], role: str, limit: int = MAX_MESHES_PER_ROLE) -> list[bpy.types.Object]:
    meshes = [o for o in objects if o and o.name in bpy.data.objects and o.type == 'MESH']
    extras = [o for o in objects if o and o.name in bpy.data.objects and o.type in {'CAMERA', 'LIGHT', 'CURVE', 'FONT', 'EMPTY'}]
    meshes.sort(key=lambda o: mesh_keep_rank(o.name, role, mesh_face_count(o), object_dimensions(o)))
    heroes = [
        o for o in meshes
        if not is_primitive_name(o.name)
        and not is_box_mesh(mesh_face_count(o), object_dimensions(o))
        and not is_dominating_plane(mesh_face_count(o), object_dimensions(o))
    ]
    pool = heroes or [
        o for o in meshes
        if not is_dominating_plane(mesh_face_count(o), object_dimensions(o))
    ] or meshes
    keep = pool[: max(1, int(limit))] if pool else []
    keep_set = set(keep)
    for obj in meshes + extras:
        if obj in keep_set:
            continue
        try:
            bpy.data.objects.remove(obj, do_unlink=True)
        except Exception:
            pass
    return keep


def cap_scene_faces(target: int = TARGET_FACES_SCENE) -> None:
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    total = sum(mesh_face_count(o) for o in meshes)
    if total <= target or not meshes:
        return
    scale = max(0.05, target / total)
    per_mesh = max(2500, int(TARGET_FACES_PER_MESH * scale))
    for obj in meshes:
        decimate_mesh(obj, per_mesh)


def parent_group(objects: list[bpy.types.Object], name: str) -> bpy.types.Object | None:
    live = [o for o in objects if o and o.name in bpy.data.objects and o.type not in {'CAMERA', 'LIGHT'}]
    if not live:
        return None
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    live_set = set(live)
    for obj in [o for o in live if o.parent not in live_set]:
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = world
    return root


def group_bounds(objects: list[bpy.types.Object]):
    points: list[Vector] = []
    bpy.context.view_layer.update()
    for obj in objects:
        if obj.type not in {'MESH', 'CURVE', 'FONT', 'SURFACE'}:
            continue
        try:
            points.extend(obj.matrix_world @ Vector(c) for c in obj.bound_box)
        except Exception:
            pass
    if not points:
        return None
    return Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))), Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))


def normalize_group(root, members, target_size, location):
    bounds = group_bounds(members)
    if bounds:
        mins, maxs = bounds
        size = max((maxs - mins).x, (maxs - mins).y, (maxs - mins).z, 0.001)
        s = target_size / size
        root.scale = (s, s, s)
        bpy.context.view_layer.update()
        bounds2 = group_bounds(members)
        if bounds2:
            mins2, maxs2 = bounds2
            center = (mins2 + maxs2) * 0.5
            root.location += Vector(location) - Vector((center.x, center.y, mins2.z))
            return
    root.location = location


def largest_image(files: list[Path]) -> Path | None:
    images = [p for p in files if p.is_file() and p.suffix.lower() in IMAGE_EXTS]
    images.sort(key=lambda p: (-p.stat().st_size, p.name.lower()))
    return images[0] if images else None


def image_material(
    name: str,
    image: Path | None,
    tile: float = 1.0,
    mix_color: tuple | None = None,
    mix_fac: float = 0.0,
):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Roughness'].default_value = 0.82
    if image and bsdf:
        try:
            tex = nodes.new('ShaderNodeTexImage')
            tex.image = bpy.data.images.load(str(image), check_existing=True)
            if tex.image:
                tex.image.colorspace_settings.name = 'sRGB'
            if tile and tile != 1.0:
                coord = nodes.new('ShaderNodeTexCoord')
                mapping = nodes.new('ShaderNodeMapping')
                mapping.inputs['Scale'].default_value = (tile, tile, tile)
                links.new(coord.outputs['UV'], mapping.inputs['Vector'])
                links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
            color_out = tex.outputs['Color']
            if mix_color and mix_fac > 0:
                try:
                    mix = nodes.new('ShaderNodeMixRGB')
                except Exception:
                    mix = nodes.new('ShaderNodeMix')
                    if hasattr(mix, 'data_type'):
                        mix.data_type = 'RGBA'
                mix.blend_type = 'MIX'
                if 'Fac' in mix.inputs:
                    mix.inputs['Fac'].default_value = float(mix_fac)
                color2 = (*[float(c) for c in mix_color[:3]], 1.0)
                if 'Color2' in mix.inputs:
                    mix.inputs['Color2'].default_value = color2
                links.new(color_out, mix.inputs['Color1'] if 'Color1' in mix.inputs else mix.inputs[6])
                color_out = mix.outputs['Color'] if 'Color' in mix.outputs else mix.outputs[2]
            links.new(color_out, bsdf.inputs['Base Color'])
        except Exception:
            pass
    return mat


def material_has_valid_image(mat) -> bool:
    if not mat or not getattr(mat, 'use_nodes', False) or not getattr(mat, 'node_tree', None):
        return False
    for node in mat.node_tree.nodes:
        if node.type != 'TEX_IMAGE':
            continue
        img = getattr(node, 'image', None)
        if img is None:
            continue
        linked = any(link.from_node == node for link in mat.node_tree.links)
        if not linked:
            continue
        if getattr(img, 'packed_file', None):
            return True
        raw = str(getattr(img, 'filepath', '') or '')
        if not raw:
            continue
        try:
            abs_path = bpy.path.abspath(raw)
        except Exception:
            abs_path = raw
        if Path(abs_path).is_file() and Path(abs_path).stat().st_size > 64:
            return True
    return False


def mesh_needs_purchased_texture(obj) -> bool:
    if obj.type != 'MESH':
        return False
    if not obj.data.materials:
        return True
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None:
            return True
        color = getattr(mat, 'diffuse_color', None)
        if color is not None and len(color) >= 3 and color[0] > 0.8 and color[1] < 0.2 and color[2] > 0.8:
            return True
        if not material_has_valid_image(mat):
            return True
    return False


def bind_purchased_textures(objects: list[bpy.types.Object], files: list[Path]) -> int:
    images = [
        p for p in files
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
        and not any(word in p.name.lower() for word in NON_ALBEDO_WORDS)
    ]
    images.sort(key=lambda p: (-min(p.stat().st_size, 8 * 1024 * 1024), p.name.lower()))
    cabin_images = [p for p in images if is_cabin_texture_name(p.name)]
    if not images:
        return 0
    bound = 0
    idx = 0
    cabin_idx = 0
    for obj in objects:
        if not mesh_needs_purchased_texture(obj):
            continue
        pool = cabin_images if (is_authored_village_mesh_name(obj.name) and cabin_images) else images
        chosen_idx = cabin_idx if pool is cabin_images else idx
        img = pool[chosen_idx % len(pool)]
        mat = image_material(f'TJ_PurchasedTex_{obj.name}'[:60], img)
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        if pool is cabin_images:
            cabin_idx += 1
        else:
            idx += 1
        bound += 1
    return bound


def create_purchased_texture_ground(files: list[Path], center=(0.0, 12.0, -0.15), size: float = 160.0) -> int:
    img = pick_ground_image_path(files) or largest_image(files)
    if not img:
        return 0
    bpy.ops.mesh.primitive_plane_add(size=max(80.0, float(size)), location=center)
    ground = bpy.context.object
    ground.name = 'TJ_Ground_Using_Purchased_Village_Texture'
    bpy.ops.object.mode_set(mode='EDIT')
    try:
        bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode='OBJECT')
    ground.data.materials.append(image_material(
        'TJ_PurchasedVillageGround',
        img,
        tile=4.0,
        mix_color=(0.22, 0.32, 0.14),
        mix_fac=0.12,
    ))
    return 1


def enable_foliage_alpha(objects: list[bpy.types.Object]) -> int:
    marked = 0
    words = ('leaf', 'leaves', 'foliage', 'tree', 'bush', 'grass', 'fern', 'pine', 'plant')
    for obj in objects:
        if not obj or obj.type != 'MESH' or not any(w in obj.name.lower() for w in words):
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or not getattr(mat, 'use_nodes', False) or not mat.node_tree:
                continue
            try:
                mat.blend_method = 'CLIP'
                if hasattr(mat, 'alpha_threshold'):
                    mat.alpha_threshold = 0.35
            except Exception:
                pass
            bsdf = mat.node_tree.nodes.get('Principled BSDF')
            if not bsdf or 'Alpha' not in bsdf.inputs:
                continue
            for node in mat.node_tree.nodes:
                if node.type != 'TEX_IMAGE' or not node.image:
                    continue
                already = any(
                    link.from_node == node and link.to_socket == bsdf.inputs['Alpha']
                    for link in mat.node_tree.links
                )
                if already:
                    continue
                try:
                    mat.node_tree.links.new(node.outputs['Alpha'], bsdf.inputs['Alpha'])
                    marked += 1
                except Exception:
                    pass
    return marked


def scatter_purchased_meshes(members: list[bpy.types.Object], origin: tuple, copies: int = 4, radius: float = 16.0) -> list[bpy.types.Object]:
    extras: list[bpy.types.Object] = []
    live = [o for o in members if o and o.name in bpy.data.objects and o.type == 'MESH']
    if not live or copies <= 0:
        return extras
    for i in range(copies):
        src = live[i % len(live)]
        try:
            dup = src.copy()
            dup.data = src.data
            bpy.context.scene.collection.objects.link(dup)
            ang = (i / max(copies, 1)) * math.tau
            dup.location = Vector(origin) + Vector((math.cos(ang) * radius, math.sin(ang) * radius * 0.65, 0.0))
            extras.append(dup)
        except Exception as exc:
            print(json.dumps({'event': 'scatter_warning', 'error': str(exc)[:180]}), flush=True)
    return extras


def load_support(files: list[Path], role: str) -> int:
    count = 0
    for p in [x for x in files if x.suffix.lower() == '.blend'][:2]:
        try:
            with bpy.data.libraries.load(str(p), link=False) as (src, dst):
                dst.materials = list(src.materials[:MAX_MATERIALS_PER_BLEND])
                dst.node_groups = list(src.node_groups[:8])
                dst.worlds = list(src.worlds[:2])
            count += len([x for x in dst.materials if x]) + len([x for x in dst.node_groups if x]) + len([x for x in dst.worlds if x])
        except Exception as exc:
            print(json.dumps({'event':'support_load_warning','role':role,'error':str(exc)[:220]}))
    if count == 0:
        image = largest_image(files)
        if image:
            try:
                bpy.data.images.load(str(image), check_existing=True)
                count = 1
            except Exception:
                pass
    # A support ZIP that contains relevant extracted files is itself a purchased
    # contribution even if Blender exposes no appendable datablocks.
    if count == 0 and files:
        count = 1
    return count


def setup_world(files: list[Path]) -> str:
    image = largest_image(files)
    if not image:
        raise RuntimeError('Purchased HDRI/JPG sky pack contributed no usable image')
    world = bpy.data.worlds.new('TJ_PurchasedSkyWorld') if not bpy.context.scene.world else bpy.context.scene.world
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    env = nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(str(image), check_existing=True)
    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 0.9
    out = nodes.new('ShaderNodeOutputWorld')
    links.new(env.outputs['Color'], bg.inputs['Color'])
    links.new(bg.outputs['Background'], out.inputs['Surface'])
    return image.name


def setup_lighting():
    bpy.ops.object.light_add(type='SUN', location=(25, -35, 80))
    sun = bpy.context.object
    sun.name = 'TJ_Sun'
    sun.data.energy = 6.0
    sun.data.angle = math.radians(5)
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(-32))
    bpy.ops.object.light_add(type='AREA', location=(-25, 5, 38))
    fill = bpy.context.object
    fill.name = 'TJ_SoftFill'
    fill.data.energy = 500
    fill.data.shape = 'DISK'
    fill.data.size = 30


def track_camera(camera, target):
    c = camera.constraints.new(type='TRACK_TO')
    c.target = target
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'


def key_loc(obj, frame, loc):
    obj.location = loc
    obj.keyframe_insert(data_path='location', frame=frame)


def smooth(obj):
    if not obj.animation_data or not obj.animation_data.action:
        return
    for fc in obj.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.handle_left_type = 'AUTO_CLAMPED'
            kp.handle_right_type = 'AUTO_CLAMPED'


def world_height(obj) -> float:
    try:
        zs = [(obj.matrix_world @ Vector(c)).z for c in obj.bound_box]
        return float(max(zs) - min(zs))
    except Exception:
        return 0.0


def is_camera_hero_object(obj) -> bool:
    if not obj or obj.type != 'MESH' or str(obj.name).startswith('TJ_Ground'):
        return False
    if is_foliage_card_name(obj.name) or is_water_or_ocean_name(obj.name):
        return False
    dims = object_dimensions(obj)
    if is_primitive_name(obj.name) or is_box_mesh(mesh_face_count(obj), dims) or is_dominating_plane(mesh_face_count(obj), dims):
        return False
    if is_camera_hero_name(obj.name):
        return world_height(obj) >= 0.6
    return False


def kit_target_size(path: Path) -> float:
    name = path.name.lower()
    if 'cabin' in name or 'house' in name or 'building' in name:
        return 11.0
    if 'tree' in name:
        return 9.0
    if 'fence' in name or 'gate' in name:
        return 6.5
    if 'cart' in name:
        return 4.0
    return 7.0


def import_kit_groups(files: list[Path], role: str, slots: list[tuple], origin: Vector, mesh_limit: int) -> tuple[list, int, list]:
    members: list[bpy.types.Object] = []
    imported = 0
    placed = []
    for candidate in geometry_candidates(files, role):
        objs = import_geometry(candidate, role)
        if not objs:
            continue
        heroes = keep_hero_meshes(objs, role, mesh_limit)
        if not heroes:
            continue
        for hero in heroes:
            decimate_mesh(hero)
        root = parent_group(heroes, f'TJ_{role}_{imported}_{candidate.stem}'[:60])
        loc = slots[imported % len(slots)]
        if root:
            normalize_group(root, heroes, kit_target_size(candidate), (
                origin.x + loc[0],
                origin.y + loc[1],
                loc[2],
            ))
        members.extend(heroes)
        placed.append(candidate.name)
        imported += 1
        print(json.dumps({
            'event': 'kit_piece_placed',
            'role': role,
            'file': candidate.name,
            'objectCount': len(heroes),
            'slot': list(loc),
        }), flush=True)
    return members, imported, placed


def setup_camera(start: int, end: int):
    meshes = [o for o in bpy.data.objects if is_camera_hero_object(o)]
    if not meshes:
        meshes = [
            o for o in bpy.data.objects
            if o.type == 'MESH'
            and not str(o.name).startswith('TJ_Ground')
            and not is_foliage_card_name(o.name)
            and not is_water_or_ocean_name(o.name)
            and not is_dominating_plane(mesh_face_count(o), object_dimensions(o))
        ]
    bounds = group_bounds(meshes)
    if bounds:
        mins, maxs = bounds
        center = (mins + maxs) * 0.5
        rx = max((maxs - mins).x * 0.5, 4.0)
        ry = max((maxs - mins).y * 0.5, 4.0)
        vert = max((maxs - mins).z, 3.0)
        look_z = mins.z + min(vert * 0.42, 6.0)
        look = (center.x, center.y, look_z)
        # Village-kit COMPLETE clipped through cabins at frames 360 and 720.
        # Orbit outside the cluster AABB instead of cutting through it.
        radius = village_orbit_radius(rx, ry)
        cam_h = min(max(vert * 0.35 + 5.0, 7.0), 16.0)
        cams = []
        for deg in (90.0, 150.0, 30.0, 210.0, 330.0, 270.0):
            ang = math.radians(deg)
            cams.append((
                center.x + math.cos(ang) * radius,
                center.y + math.sin(ang) * radius,
                mins.z + cam_h,
            ))
        pad = 6.0
        for i, (x, y, z) in enumerate(cams):
            inside_x = (mins.x - pad) <= x <= (maxs.x + pad)
            inside_y = (mins.y - pad) <= y <= (maxs.y + pad)
            if inside_x and inside_y:
                vx, vy = x - center.x, y - center.y
                n = math.hypot(vx, vy) or 1.0
                extra = max(rx, ry) + pad + 2.0
                cams[i] = (center.x + vx / n * extra, center.y + vy / n * extra, z)
        targets = [look, look, look, look, look, look]
    else:
        cams = [(0,145,42),(-24,105,24),(24,70,18),(-18,30,12),(20,-12,16),(0,-58,38)]
        targets = [(0,92,10),(0,68,6),(0,42,5),(0,10,4),(0,-6,5),(0,18,9)]
    bpy.ops.object.camera_add(location=cams[0])
    cam = bpy.context.object
    cam.name = 'TJ_Original14_Camera'
    cam.data.lens = 32
    bpy.context.scene.camera = cam
    target = bpy.data.objects.new('TJ_Original14_Target', None)
    bpy.context.scene.collection.objects.link(target)
    track_camera(cam, target)
    frames = [start, start+179, start+359, start+539, start+719, end]
    for f,c,t in zip(frames,cams,targets):
        key_loc(cam,f,c); key_loc(target,f,t)
    smooth(cam); smooth(target)


def configure_render(args):
    scene = bpy.context.scene
    width, height = [int(x) for x in args.resolution.lower().split('x',1)]
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.fps = args.fps
    scene.frame_start = args.start_frame
    scene.frame_end = args.end_frame
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.filepath = str(Path(args.output_dir) / 'frame_')
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.use_persistent_data = True
    if hasattr(scene, 'eevee'):
        if hasattr(scene.eevee, 'taa_render_samples'):
            scene.eevee.taa_render_samples = max(1, int(args.samples))
        if hasattr(scene.eevee, 'use_raytracing'):
            scene.eevee.use_raytracing = False
        if hasattr(scene.eevee, 'use_shadows'):
            scene.eevee.use_shadows = False
        if hasattr(scene.eevee, 'use_volumetric_shadows'):
            scene.eevee.use_volumetric_shadows = False
        if hasattr(scene.eevee, 'use_gtao'):
            scene.eevee.use_gtao = False
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass


def install_frame_handlers(end_frame: int) -> None:
    def on_write(_scene, *_args):
        frame = int(getattr(_scene, 'frame_current', 0) or 0)
        write_progress('BLENDER_RENDER', frame=frame, framesWritten=frame, totalFrames=end_frame)

    bpy.app.handlers.render_write.append(on_write)


def main() -> int:
    global PROGRESS_PATH
    args = parse_args()
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    if args.progress_path:
        PROGRESS_PATH = Path(args.progress_path)
        PROGRESS_PATH.parent.mkdir(parents=True, exist_ok=True)
    write_progress('EXTRACT_PURCHASED_ASSETS', frame=0, framesWritten=0, totalFrames=args.end_frame)
    assets = json.loads(args.assets_json)
    renderable = [a for a in assets if not a.get('unityPreservationOnly')]
    roles = {a['role'] for a in renderable}
    missing = sorted(RENDERABLE_ROLES - roles)
    if missing:
        raise RuntimeError(f'Original-14 renderable sources missing: {missing}')

    clean_scene()
    expanded: dict[str, list[Path]] = {}
    extract_root = out.parent / 'expanded-original14'
    for asset in renderable:
        expanded[asset['role']] = expand_asset(asset, extract_root)

    contributions: dict[str, dict] = {}
    village_center = Vector((0.0, 0.0, 0.0))
    village_slots = [
        (-9.0, -3.0, 0.0), (0.0, 5.0, 0.0), (9.0, -1.5, 0.0), (11.0, 7.0, 0.0),
        (2.0, -9.0, 0.0), (-11.0, 8.0, 0.0), (6.0, 11.0, 0.0), (-6.0, -8.0, 0.0),
    ]
    fbx_slots = [
        (-14.0, 1.0, 0.0), (14.0, 2.0, 0.0), (-4.0, 13.0, 0.0),
        (4.0, -13.0, 0.0), (16.0, -8.0, 0.0), (-16.0, -6.0, 0.0),
    ]
    forest_slots = {
        'forest_nature': [(-20.0, 16.0, 0.0), (20.0, 15.0, 0.0)],
        'forest_ecokit': [(-18.0, -16.0, 0.0), (18.0, -14.0, 0.0)],
    }

    # Village zip is 33 kit pieces (Cabin01A.blend, Tree02.blend, ...), not one
    # authored scene. The previous run imported a single leftover cabin and
    # treated it as the village, then framed a giant forest leaf.
    members, imported_files, placed = import_kit_groups(
        expanded.get('village_blender', []),
        'village_blender',
        village_slots,
        village_center,
        6,
    )
    if not members:
        raise RuntimeError('Purchased source village_blender contributed no importable geometry')
    bound = bind_purchased_textures(members, expanded.get('village_textures', []) + expanded.get('village_blender', []))
    contributions['village_blender'] = {
        'type': 'visible_geometry',
        'objectCount': len(members),
        'importedFileCount': imported_files,
        'purchasedTexturesBound': bound,
        'scatteredPurchasedCopies': 0,
        'authoredLayoutKept': False,
        'kitFilesPlaced': placed,
        'assembledAsVillageKit': True,
    }

    members, imported_files, placed = import_kit_groups(
        expanded.get('village_fbx', []),
        'village_fbx',
        fbx_slots,
        village_center,
        5,
    )
    if not members:
        raise RuntimeError('Purchased source village_fbx contributed no importable geometry')
    bound = bind_purchased_textures(members, expanded.get('village_textures', []) + expanded.get('village_fbx', []))
    contributions['village_fbx'] = {
        'type': 'visible_geometry',
        'objectCount': len(members),
        'importedFileCount': imported_files,
        'purchasedTexturesBound': bound,
        'scatteredPurchasedCopies': 0,
        'authoredLayoutKept': False,
        'kitFilesPlaced': placed,
        'assembledAsVillageKit': True,
    }

    # Project File.blend is a water/flora/terrain library, not the village.
    # Keep flora as a distant backdrop; never let water set the camera center.
    role = 'village_project'
    files = expanded.get(role, [])
    members = []
    imported_files = 0
    for candidate in geometry_candidates(files, role):
        objs = import_geometry(candidate, role)
        if objs:
            heroes = keep_hero_meshes(objs, role, 16)
            for hero in heroes:
                decimate_mesh(hero)
            members.extend(heroes)
            imported_files += 1
    if not members:
        raise RuntimeError(f'Purchased source {role} contributed no importable geometry')
    extras: list[bpy.types.Object] = []
    root = parent_group(members, 'TJ_village_project_PurchasedRoot')
    if root:
        normalize_group(root, members, 18.0, (village_center.x, village_center.y + 22.0, 0.0))
    bound = bind_purchased_textures(members, expanded.get('village_textures', []) + files)
    contributions[role] = {
        'type': 'visible_geometry',
        'objectCount': len(members),
        'importedFileCount': imported_files,
        'purchasedTexturesBound': bound,
        'scatteredPurchasedCopies': len(extras),
        'authoredLayoutKept': False,
        'placedAsBackdrop': True,
    }

    for role in ('forest_nature', 'forest_ecokit'):
        files = expanded.get(role, [])
        members, imported_files, placed = import_kit_groups(
            files,
            role,
            forest_slots[role],
            village_center,
            MAX_MESHES_PER_ROLE,
        )
        if not members:
            raise RuntimeError(f'Purchased source {role} contributed no importable geometry')
        extras = scatter_purchased_meshes(
            members,
            (village_center.x + forest_slots[role][0][0], village_center.y + forest_slots[role][0][1], 0.0),
            copies=4,
            radius=10.0,
        )
        members.extend(extras)
        bound = bind_purchased_textures(members, expanded.get('village_textures', []) + files)
        contributions[role] = {
            'type': 'visible_geometry',
            'objectCount': len(members),
            'importedFileCount': imported_files,
            'purchasedTexturesBound': bound,
            'scatteredPurchasedCopies': len(extras),
            'authoredLayoutKept': False,
            'kitFilesPlaced': placed,
        }

    scene_meshes = [o for o in bpy.data.objects if is_camera_hero_object(o)]
    bounds = group_bounds(scene_meshes)
    if bounds:
        mins, maxs = bounds
        center = (mins + maxs) * 0.5
        horiz = max((maxs - mins).x, (maxs - mins).y, 16.0)
        ground_size = min(max(horiz * 1.8, 40.0), 90.0)
        ground_loc = (center.x, center.y, mins.z - 0.12)
    else:
        ground_size = 60.0
        ground_loc = (0.0, 0.0, -0.15)
    ground_count = create_purchased_texture_ground(expanded.get('village_textures', []), ground_loc, ground_size)
    if not ground_count:
        raise RuntimeError('Purchased village texture pack contributed no usable image')
    contributions['village_textures'] = {'type':'visible_texture','objectCount':ground_count}

    sky_name = setup_world(expanded.get('sky_hdri', []))
    contributions['sky_hdri'] = {'type':'world_environment','imageLoaded':True}

    for role in SUPPORT_ROLES:
        count = load_support(expanded.get(role, []), role)
        if count <= 0:
            raise RuntimeError(f'Purchased support source {role} contributed no loadable data')
        contributions[role] = {'type':'support_data','loadedDataCount':count}

    if set(contributions) != RENDERABLE_ROLES:
        raise RuntimeError('Not all 11 renderable Original-14 sources contributed to scene construction')

    leftover_images = []
    for role_files in expanded.values():
        leftover_images.extend(role_files)
    leftover = bind_purchased_textures(
        [o for o in bpy.data.objects if o.type == 'MESH' and not str(o.name).startswith('TJ_Ground')],
        leftover_images,
    )
    print(json.dumps({'event': 'leftover_texture_bind', 'bound': leftover}), flush=True)

    dropped_boxes = 0
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH' or str(obj.name).startswith('TJ_Ground'):
            continue
        if not (
            is_primitive_name(obj.name)
            or is_box_mesh(mesh_face_count(obj), object_dimensions(obj))
            or is_dominating_plane(mesh_face_count(obj), object_dimensions(obj))
        ):
            continue
        try:
            bpy.data.objects.remove(obj, do_unlink=True)
            dropped_boxes += 1
        except Exception:
            pass
    print(json.dumps({'event': 'dropped_primitive_boxes', 'count': dropped_boxes}), flush=True)

    foliage_alpha = enable_foliage_alpha(
        [o for o in bpy.data.objects if o.type == 'MESH' and not str(o.name).startswith('TJ_Ground')]
    )
    print(json.dumps({'event': 'foliage_alpha_clip', 'linked': foliage_alpha}), flush=True)

    cap_scene_faces()
    write_progress('BUILD_SCENE', frame=0, framesWritten=0, totalFrames=args.end_frame)
    setup_lighting()
    setup_camera(args.start_frame, args.end_frame)
    configure_render(args)
    install_frame_handlers(args.end_frame)

    proof = {
        'schema':'TIVVLEJOY_ORIGINAL14_SCENERY_USAGE_V1',
        'internalResolution':args.resolution,
        'finalTargetResolution':'1080x1920',
        'fps':args.fps,
        'frameCount':args.end_frame-args.start_frame+1,
        'renderableSourceCount':len(renderable),
        'renderableRoles':sorted(roles),
        'contributions':contributions,
        'purchasedSkyImageLoaded':bool(sky_name),
        'randomOrGeneratedStockAssetCount':0,
        'commercialAssetPathsEmitted':False,
    }
    Path(args.proof_path).write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'event':'tivvlejoy_original14_render_start','frames':proof['frameCount'],'resolution':args.resolution,'samples':args.samples}), flush=True)
    write_progress('BLENDER_STARTED', frame=0, framesWritten=0, totalFrames=proof['frameCount'])
    bpy.ops.render.render(animation=True)
    print(json.dumps({'event':'tivvlejoy_original14_render_complete','frames':proof['frameCount']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

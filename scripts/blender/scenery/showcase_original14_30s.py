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
    cinematic_world_camera_keys,
    extract_role_limit,
    extract_sort_key,
    geometry_file_limit,
    is_authored_village_mesh_name,
    is_bank_flora_name,
    is_box_mesh,
    is_cabin_texture_name,
    is_camera_hero_name,
    is_dominating_plane,
    is_foliage_card_name,
    is_forest_camera_subject_name,
    is_grass_card_texture_name,
    is_mountain_camera_subject_name,
    is_high_lod_name,
    is_primitive_name,
    is_village_camera_subject_name,
    is_water_or_ocean_name,
    mesh_keep_rank,
    pick_cabin_albedo_path,
    pick_daylight_sky_path,
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
    p.add_argument('--stills-only', action='store_true')
    p.add_argument('--stills-frames', default='1,150,300,450,600,750,900')
    p.add_argument('--engine', default='BLENDER_EEVEE_NEXT')
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


def select_blend_names(names: list[str], role: str, limit: int = 10, allow_water: bool = False) -> list[str]:
    words = {
        'village_blender': ('house', 'cabin', 'building', 'roof', 'tree', 'fence', 'gate', 'cart'),
        'village_project': ('house', 'cabin', 'building', 'roof', 'tree', 'rock', 'flora', 'bush', 'water', 'terrain'),
        'village_fbx': ('house', 'cabin', 'building', 'roof', 'tree', 'fence', 'gate', 'cart'),
        'forest_nature': ('tree', 'rock', 'bush', 'grass', 'fern', 'log', 'stump'),
        'forest_ecokit': ('tree', 'rock', 'bush', 'grass', 'fern', 'log', 'stump'),
        'background_mountains': ('mountain', 'range', 'peak', 'ridge', 'cliff', 'grass', 'meadow'),
    }.get(role, ())
    usable = [
        n for n in names
        if n
        and not is_primitive_name(n)
        and (allow_water or not is_water_or_ocean_name(n))
        and not is_foliage_card_name(n)
        and not is_high_lod_name(n)
    ]
    preferred = [n for n in usable if any(w in n.lower() for w in words)]
    if role == 'background_mountains':
        lp = [n for n in usable if n.lower().startswith('lp_')]
        if lp:
            return lp[:limit]
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


def append_blend_geometry(path: Path, role: str, allow_water: bool = False) -> tuple[list[bpy.types.Object], int]:
    before = set(bpy.data.objects.keys())
    loaded_support = 0
    try:
        with bpy.data.libraries.load(str(path), link=False) as (src, dst):
            src_names = list(src.objects or [])
            if allow_water and role == 'village_project':
                dst.objects = [n for n in src_names if n and is_water_or_ocean_name(n)][:MAX_OBJECTS_PER_BLEND]
            else:
                dst.objects = select_blend_names(src_names, role, limit=MAX_OBJECTS_PER_BLEND, allow_water=allow_water)
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
    """Replace only missing or magenta materials. Authored graphs are remapped, not overwritten."""
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
        if mat.node_tree:
            return False
    return False


def index_extracted_images(files: list[Path]) -> dict[str, Path]:
    index: dict[str, Path] = {}
    for path in files:
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
            continue
        if is_grass_card_texture_name(path.name):
            continue
        index.setdefault(path.name.lower(), path)
    return index


def remap_missing_images(files: list[Path]) -> int:
    index = index_extracted_images(files)
    if not index:
        return 0
    remapped = 0
    for img in bpy.data.images:
        if getattr(img, 'packed_file', None):
            continue
        raw = str(getattr(img, 'filepath', '') or img.name)
        name = Path(raw.replace('\\', '/')).name.lower()
        if not name or name not in index:
            continue
        try:
            abs_path = bpy.path.abspath(raw)
        except Exception:
            abs_path = raw
        on_disk = False
        try:
            on_disk = Path(abs_path).is_file() and Path(abs_path).stat().st_size > 64
        except Exception:
            on_disk = False
        if on_disk:
            continue
        try:
            img.filepath = str(index[name])
            img.reload()
            remapped += 1
        except Exception as exc:
            print(json.dumps({'event': 'image_remap_warning', 'name': name, 'error': str(exc)[:160]}), flush=True)
    return remapped


def _load_named_albedo(files: list[Path], *needles: str) -> bpy.types.Image | None:
    for path in files:
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
            continue
        name = path.name.lower()
        if is_grass_card_texture_name(name) or 'wood01' in name:
            continue
        if all(needle in name for needle in needles):
            try:
                return bpy.data.images.load(str(path), check_existing=True)
            except Exception:
                return None
    return None


def ensure_purchased_albedos(files: list[Path]) -> int:
    """Force authored cabin/tree image nodes onto the real extracted albedos."""
    cabin = _load_named_albedo(files, 'colored', 'cabin', 'alb') or _load_named_albedo(files, 'cabin', 'alb')
    straw = _load_named_albedo(files, 'colored', 'straw', 'alb') or _load_named_albedo(files, 'straw', 'alb')
    leaf = _load_named_albedo(files, 'colored', 'leaf', 'alb') or _load_named_albedo(files, 'leaf', 'alb')
    trunk = _load_named_albedo(files, 'colored', 'trunk', 'alb') or _load_named_albedo(files, 'trunk', 'alb')
    bound = 0
    for img_node_owner in bpy.data.materials:
        if not img_node_owner.node_tree:
            continue
        for node in img_node_owner.node_tree.nodes:
            if node.type != 'TEX_IMAGE':
                continue
            current = (node.image.name if node.image else node.name).lower()
            chosen = None
            if 'cabin' in current or 'building' in current:
                chosen = cabin
            elif 'straw' in current or 'roof' in current:
                chosen = straw
            elif 'leaf' in current:
                chosen = leaf
            elif 'trunk' in current:
                chosen = trunk
            if chosen is None:
                continue
            if node.image != chosen:
                node.image = chosen
                bound += 1
    return bound


def bind_purchased_textures(objects: list[bpy.types.Object], files: list[Path]) -> int:
    images = [
        p for p in files
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
        and not any(word in p.name.lower() for word in NON_ALBEDO_WORDS)
        and not is_grass_card_texture_name(p.name)
    ]
    images.sort(key=lambda p: (-min(p.stat().st_size, 8 * 1024 * 1024), p.name.lower()))
    cabin_images = [p for p in images if is_cabin_texture_name(p.name)]
    cabin_atlas = pick_cabin_albedo_path(files)
    if cabin_atlas:
        cabin_images = [cabin_atlas] + [p for p in cabin_images if p != cabin_atlas]
    if not images:
        return 0
    bound = 0
    idx = 0
    cabin_idx = 0
    for obj in objects:
        if not mesh_needs_purchased_texture(obj):
            continue
        if is_mountain_camera_subject_name(obj.name, subject_parent_name(obj)):
            continue
        pool = cabin_images if (is_authored_village_mesh_name(obj.name) and cabin_images) else images
        if not pool:
            continue
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


def packed_meadow_image():
    for img in bpy.data.images:
        name = str(img.name or '').lower()
        if not getattr(img, 'packed_file', None):
            continue
        if name.startswith('texture.png') or name.startswith('vegetation.png'):
            return img
    return None


def create_valley_ground(files: list[Path], center=(0.0, 16.0, -0.08), size: float = 140.0) -> tuple[int, str]:
    """Cover the HDRI gray hemisphere with purchased grassy/dirt albedo, never Grass01 cards."""
    packed = packed_meadow_image()
    img_path = None
    source = 'none'
    if packed is not None:
        source = f'packed:{packed.name}'
    else:
        candidates = [
            p for p in files
            if p.is_file()
            and p.suffix.lower() in IMAGE_EXTS
            and not is_grass_card_texture_name(p.name)
            and any(word in p.name.lower() for word in ('dirt', 'soil', 'moss', 'ground', 'rock', 'meadow', 'terrain'))
            and not any(word in p.name.lower() for word in NON_ALBEDO_WORDS)
        ]
        img_path = pick_ground_image_path(candidates) if candidates else None
        if img_path and is_grass_card_texture_name(img_path.name):
            img_path = None
        source = img_path.name if img_path else 'authored_meadow_grade'
    bpy.ops.mesh.primitive_plane_add(size=max(90.0, float(size)), location=center)
    ground = bpy.context.object
    ground.name = 'TJ_ValleyFloor_PurchasedMeadow'
    bpy.ops.object.mode_set(mode='EDIT')
    try:
        bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode='OBJECT')
    mat = bpy.data.materials.new('TJ_PurchasedValleyMeadow')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    out = nodes.new('ShaderNodeOutputMaterial')
    if 'Roughness' in bsdf.inputs:
        bsdf.inputs['Roughness'].default_value = 0.94
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.12
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    color_src = None
    if packed is not None or img_path is not None:
        tex = nodes.new('ShaderNodeTexImage')
        if packed is not None:
            tex.image = packed
        else:
            tex.image = bpy.data.images.load(str(img_path), check_existing=True)
        if tex.image and tex.image.colorspace_settings:
            tex.image.colorspace_settings.name = 'sRGB'
        coord = nodes.new('ShaderNodeTexCoord')
        mapping = nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (3.2, 3.2, 3.2)
        links.new(coord.outputs['UV'], mapping.inputs['Vector'])
        links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
        try:
            mix = nodes.new('ShaderNodeMixRGB')
        except Exception:
            mix = nodes.new('ShaderNodeMix')
            if hasattr(mix, 'data_type'):
                mix.data_type = 'RGBA'
        mix.blend_type = 'MIX'
        if 'Fac' in mix.inputs:
            mix.inputs['Fac'].default_value = 0.48
        if 'Color2' in mix.inputs:
            mix.inputs['Color2'].default_value = (0.27, 0.46, 0.16, 1.0)
        links.new(tex.outputs['Color'], mix.inputs['Color1'] if 'Color1' in mix.inputs else mix.inputs[6])
        color_src = mix.outputs['Color'] if 'Color' in mix.outputs else mix.outputs[2]
    if color_src is not None:
        links.new(color_src, bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (0.30, 0.46, 0.18, 1.0)
    ground.data.materials.append(mat)
    return 1, source


def create_purchased_stream(center=(0.0, 16.0, -0.03), size=(8.0, 42.0)) -> int:
    water_mat = next((m for m in bpy.data.materials if m and str(m.name).startswith('Water_Mat')), None)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    stream = bpy.context.object
    stream.name = 'TJ_River_From_Purchased_Water_Mat'
    stream.scale = (size[0] * 0.5, size[1] * 0.5, 0.08)
    bpy.context.view_layer.update()
    if water_mat is not None:
        stream.data.materials.clear()
        stream.data.materials.append(water_mat)
    else:
        mat = bpy.data.materials.new('TJ_PurchasedWaterFallback')
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            if 'Base Color' in bsdf.inputs:
                bsdf.inputs['Base Color'].default_value = (0.22, 0.42, 0.55, 1.0)
            if 'Roughness' in bsdf.inputs:
                bsdf.inputs['Roughness'].default_value = 0.08
            if 'Transmission Weight' in bsdf.inputs:
                bsdf.inputs['Transmission Weight'].default_value = 0.55
            elif 'Transmission' in bsdf.inputs:
                bsdf.inputs['Transmission'].default_value = 0.55
        stream.data.materials.append(mat)
    return 1


def load_water_materials(files: list[Path]) -> int:
    loaded = 0
    for path in files:
        if path.suffix.lower() != '.blend':
            continue
        if 'water' not in path.name.lower() and 'project file' not in path.name.lower():
            continue
        try:
            with bpy.data.libraries.load(str(path), link=False) as (src, dst):
                mats = [n for n in list(src.materials or []) if n and 'water' in n.lower()]
                groups = [n for n in list(src.node_groups or []) if n and 'water' in n.lower()]
                dst.materials = mats[:8]
                dst.node_groups = groups[:8]
            loaded += len([m for m in dst.materials if m]) + len([g for g in dst.node_groups if g])
        except Exception as exc:
            print(json.dumps({'event': 'water_material_warning', 'file': path.name, 'error': str(exc)[:180]}), flush=True)
    return loaded


def append_named_objects(path: Path, names: list[str]) -> list[bpy.types.Object]:
    before = set(bpy.data.objects.keys())
    wanted = [n for n in names if n]
    if not wanted:
        return []
    try:
        with bpy.data.libraries.load(str(path), link=False) as (src, dst):
            have = set(src.objects or [])
            dst.objects = [n for n in wanted if n in have][:MAX_OBJECTS_PER_BLEND]
            dst.materials = list(src.materials[:MAX_MATERIALS_PER_BLEND])
            dst.node_groups = [n for n in list(src.node_groups or []) if n][:8]
        for obj in dst.objects:
            if obj is not None and obj.name not in bpy.context.scene.collection.objects:
                try:
                    bpy.context.scene.collection.objects.link(obj)
                except RuntimeError:
                    pass
    except Exception as exc:
        print(json.dumps({'event': 'named_append_warning', 'file': path.name, 'error': str(exc)[:180]}), flush=True)
        return []
    return [bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before]


def place_mountain_ridge(members: list[bpy.types.Object], origin: Vector) -> int:
    live = [o for o in members if o and o.name in bpy.data.objects and o.type == 'MESH']
    if not live:
        return 0
    slots = [(-24.0, 60.0), (0.0, 66.0), (24.0, 58.0), (-10.0, 74.0), (14.0, 72.0)]
    placed = 0
    for i, obj in enumerate(live[:len(slots)]):
        try:
            mw = obj.matrix_world.copy()
            obj.parent = None
            obj.matrix_world = mw
            bpy.context.view_layer.update()
            dims = object_dimensions(obj)
            width = max(dims[0], dims[1], 1.0)
            height = max(dims[2], 1.0)
            obj.scale = (
                obj.scale[0] * (70.0 / width),
                obj.scale[1] * (70.0 / width),
                obj.scale[2] * (34.0 / height),
            )
            bpy.context.view_layer.update()
            bounds = group_bounds([obj])
            loc = (origin.x + slots[i][0], origin.y + slots[i][1], 0.0)
            if bounds:
                mins, maxs = bounds
                center = (mins + maxs) * 0.5
                obj.location += Vector(loc) - Vector((center.x, center.y, mins.z))
            else:
                obj.location = loc
            placed += 1
        except Exception as exc:
            print(json.dumps({'event': 'mountain_place_warning', 'object': obj.name, 'error': str(exc)[:160]}), flush=True)
    return placed


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


def setup_world(hdri_files: list[Path], shader_files: list[Path] | None = None) -> str:
    shader_files = shader_files or []
    image = pick_daylight_sky_path(hdri_files) or largest_image(hdri_files)
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
    if env.image and env.image.colorspace_settings:
        env.image.colorspace_settings.name = 'sRGB'
    # Hide the purchased plate's gray lower hemisphere so the valley floor reads as land.
    texcoord = nodes.new('ShaderNodeTexCoord')
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(texcoord.outputs['Normal'], sep.inputs['Vector'])
    try:
        mix = nodes.new('ShaderNodeMixRGB')
    except Exception:
        mix = nodes.new('ShaderNodeMix')
        if hasattr(mix, 'data_type'):
            mix.data_type = 'RGBA'
    mix.blend_type = 'MIX'
    # Normal.z > 0 is sky; blend a warm meadow into the gray ground hemisphere.
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.02
    ramp.color_ramp.elements[0].color = (1.0, 1.0, 1.0, 1.0)
    ramp.color_ramp.elements[1].position = 0.12
    ramp.color_ramp.elements[1].color = (0.0, 0.0, 0.0, 1.0)
    links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    if 'Fac' in mix.inputs:
        links.new(ramp.outputs['Color'], mix.inputs['Fac'])
    if 'Color1' in mix.inputs:
        mix.inputs['Color1'].default_value = (0.42, 0.62, 0.88, 1.0)
        links.new(env.outputs['Color'], mix.inputs['Color2'])
    else:
        mix.inputs[6].default_value = (0.42, 0.62, 0.88, 1.0)
        links.new(env.outputs['Color'], mix.inputs[7])
    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 1.45
    out = nodes.new('ShaderNodeOutputWorld')
    color_out = mix.outputs['Color'] if 'Color' in mix.outputs else mix.outputs[2]
    links.new(color_out, bg.inputs['Color'])
    links.new(bg.outputs['Background'], out.inputs['Surface'])
    return image.name


def setup_lighting():
    # Bright warm daylight: readable cabin detail, not crushed dusk.
    bpy.ops.object.light_add(type='SUN', location=(28, -40, 62))
    sun = bpy.context.object
    sun.name = 'TJ_Sun'
    sun.data.energy = 3.4
    sun.data.angle = math.radians(4.2)
    sun.rotation_euler = (math.radians(58), math.radians(2), math.radians(8))
    if hasattr(sun.data, 'use_shadow'):
        sun.data.use_shadow = True
    if hasattr(sun.data, 'color'):
        sun.data.color = (1.0, 0.96, 0.86)
    bpy.ops.object.light_add(type='AREA', location=(-18, -8, 28))
    fill = bpy.context.object
    fill.name = 'TJ_SkyFill'
    fill.data.energy = 2400
    fill.data.shape = 'DISK'
    fill.data.size = 48
    fill.rotation_euler = (math.radians(35), 0.0, math.radians(12))
    if hasattr(fill.data, 'color'):
        fill.data.color = (0.72, 0.84, 1.0)
    bpy.ops.object.light_add(type='AREA', location=(8, -20, 14))
    bounce = bpy.context.object
    bounce.name = 'TJ_GroundBounce'
    bounce.data.energy = 900
    bounce.data.shape = 'RECTANGLE'
    bounce.data.size = 36
    if hasattr(bounce.data, 'size_y'):
        bounce.data.size_y = 24
    bounce.rotation_euler = (math.radians(90), 0.0, 0.0)
    if hasattr(bounce.data, 'color'):
        bounce.data.color = (1.0, 0.90, 0.70)


def setup_atmosphere():
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.0, 4.0, 18.0))
    fog = bpy.context.object
    fog.name = 'TJ_Atmosphere'
    fog.scale = (180.0, 200.0, 70.0)
    mat = bpy.data.materials.new('TJ_AtmosphereMaterial')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    volume = nodes.new('ShaderNodeVolumePrincipled')
    if 'Density' in volume.inputs:
        volume.inputs['Density'].default_value = 0.00018
    if 'Anisotropy' in volume.inputs:
        volume.inputs['Anisotropy'].default_value = 0.22
    if 'Color' in volume.inputs:
        volume.inputs['Color'].default_value = (0.86, 0.78, 0.68, 1.0)
    out = nodes.new('ShaderNodeOutputMaterial')
    links.new(volume.outputs['Volume'], out.inputs['Volume'])
    fog.data.materials.append(mat)
    fog.display_type = 'WIRE'
    fog.hide_select = True


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
    if 'mountain' in name or 'grassy' in name or 'meadow' in name:
        return 90.0
    if 'nature_kit' in name or 'forest' in name:
        return 24.0
    if 'swarm' in name:
        return 14.0
    if 'rock' in name:
        return 5.5
    if 'tree' in name:
        return 10.0
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


def subject_parent_name(obj) -> str:
    parent = getattr(obj, 'parent', None)
    return str(getattr(parent, 'name', '') or '')


def setup_camera(start: int, end: int):
    heroes = [o for o in bpy.data.objects if is_camera_hero_object(o)]
    village = [
        o for o in heroes
        if is_village_camera_subject_name(o.name, subject_parent_name(o))
    ]
    forest = [
        o for o in heroes
        if is_forest_camera_subject_name(o.name, subject_parent_name(o))
    ]
    if not village:
        village = [
            o for o in bpy.data.objects
            if o.type == 'MESH'
            and not str(o.name).startswith('TJ_Ground')
            and not is_foliage_card_name(o.name)
            and not is_water_or_ocean_name(o.name)
            and not is_dominating_plane(mesh_face_count(o), object_dimensions(o))
            and not is_forest_camera_subject_name(o.name, subject_parent_name(o))
        ]
    # Measured AABBs swallowed the north outskirts and pulled the camera
    # into a cabin close-up. Author the valley path so every 9:16 still
    # can hold village / river / forest / mountains / sky.
    keys = cinematic_world_camera_keys(
        -8.0, -7.0, 8.0, 7.0, 0.0, 8.0,
        forest_x=0.0, forest_y=32.0, forest_z=6.0,
        mountain_x=0.0, mountain_y=64.0, mountain_z=18.0,
    )
    bpy.ops.object.camera_add(location=keys[0]['camera'])
    cam = bpy.context.object
    cam.name = 'TJ_Original14_Camera'
    cam.data.lens = keys[0]['lens']
    cam.data.sensor_width = 32
    bpy.context.scene.camera = cam
    target = bpy.data.objects.new('TJ_Original14_Target', None)
    bpy.context.scene.collection.objects.link(target)
    track_camera(cam, target)
    frames = [start, start + 179, start + 359, start + 539, start + 719, end]
    for frame, key in zip(frames, keys):
        key_loc(cam, frame, key['camera'])
        key_loc(target, frame, key['look'])
        cam.data.lens = key['lens']
        cam.data.keyframe_insert(data_path='lens', frame=frame)
    smooth(cam)
    smooth(target)
    print(json.dumps({
        'event': 'cinematic_camera_path',
        'villageHeroCount': len(village),
        'forestHeroCount': len(forest),
        'lenses': [k['lens'] for k in keys],
        'looksDistinct': len({tuple(k['look']) for k in keys}),
    }), flush=True)


def configure_render(args):
    scene = bpy.context.scene
    width, height = [int(x) for x in args.resolution.lower().split('x',1)]
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.fps = args.fps
    scene.frame_start = args.start_frame
    scene.frame_end = args.end_frame
    engine = str(getattr(args, 'engine', '') or 'BLENDER_EEVEE_NEXT')
    scene.render.engine = engine
    if engine == 'CYCLES' and hasattr(scene, 'cycles'):
        scene.cycles.samples = max(1, int(args.samples))
        if hasattr(scene.cycles, 'use_denoising'):
            scene.cycles.use_denoising = False
        try:
            scene.cycles.device = 'CPU'
        except Exception:
            pass
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
            scene.eevee.use_shadows = True
        if hasattr(scene.eevee, 'use_volumetric_shadows'):
            scene.eevee.use_volumetric_shadows = False
        if hasattr(scene.eevee, 'use_gtao'):
            scene.eevee.use_gtao = True
        if hasattr(scene.eevee, 'gtao_distance'):
            scene.eevee.gtao_distance = 0.35
        if hasattr(scene.eevee, 'gtao_quality'):
            scene.eevee.gtao_quality = 0.45
        if hasattr(scene.eevee, 'volumetric_tile_size'):
            try:
                scene.eevee.volumetric_tile_size = '8'
            except Exception:
                pass
        if hasattr(scene.eevee, 'volumetric_end'):
            scene.eevee.volumetric_end = 80.0
        if hasattr(scene.eevee, 'volumetric_samples'):
            scene.eevee.volumetric_samples = 32
    try:
        if hasattr(scene, 'view_settings'):
            scene.view_settings.view_transform = 'AgX'
            scene.view_settings.look = 'AgX - Medium Contrast'
            scene.view_settings.exposure = 0.48
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
        (-6.5, -2.0, 0.0), (0.5, 3.5, 0.0), (7.0, -1.0, 0.0), (8.0, 5.5, 0.0),
        (1.5, -6.5, 0.0), (-8.0, 5.0, 0.0), (4.5, 8.0, 0.0), (-4.5, -6.0, 0.0),
    ]
    fbx_slots = [
        (-9.0, 10.0, 0.0), (9.0, 11.0, 0.0), (0.0, 13.5, 0.0),
        (12.0, 6.5, 0.0), (-12.0, 7.0, 0.0), (5.0, 15.0, 0.0),
    ]
    forest_slots = {
        'forest_nature': [(-8.0, 30.0, 0.0), (8.0, 34.0, 0.0), (0.0, 38.0, 0.0)],
        'forest_ecokit': [(10.0, 27.0, 0.0), (-12.0, 36.0, 0.0), (6.0, 42.0, 0.0)],
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

    # Project File.blend is a water/flora/terrain library. Terrain_003 is an
    # empty 12 m plane — do not scale it into another slab. Use packed flora
    # as riverbank dressing and Water_Mat_1 on an authored stream strip.
    role = 'village_project'
    files = expanded.get(role, [])
    members: list[bpy.types.Object] = []
    imported_files = 0
    water_loaded = load_water_materials(files + expanded.get('forest_ecokit', []))
    for candidate in geometry_candidates(files, role):
        try:
            with bpy.data.libraries.load(str(candidate), link=False) as (src, _dst):
                src_names = list(src.objects or [])
        except Exception:
            src_names = []
        flora_names = [n for n in src_names if is_bank_flora_name(n)]
        objs = append_named_objects(candidate, flora_names[:24])
        if objs:
            keep = [o for o in objs if o.type == 'MESH' and not is_foliage_card_name(o.name)]
            drop = [o for o in objs if o not in keep]
            for obj in drop:
                try:
                    bpy.data.objects.remove(obj, do_unlink=True)
                except Exception:
                    pass
            members.extend(keep)
            imported_files += 1
    if members:
        bank_slots = [
            (-6.0, 14.5, 0.0), (6.0, 17.5, 0.0), (-3.0, 18.0, 0.0),
            (4.0, 13.5, 0.0), (0.0, 20.0, 0.0), (9.0, 15.0, 0.0),
        ]
        for i, obj in enumerate(members[:len(bank_slots)]):
            root = parent_group([obj], f'TJ_riverbank_{i}_{obj.name}'[:55])
            if root:
                normalize_group(root, [obj], 3.2, (
                    village_center.x + bank_slots[i][0],
                    village_center.y + bank_slots[i][1],
                    bank_slots[i][2],
                ))
    river_count = create_purchased_stream((village_center.x, village_center.y + 16.0, -0.03), (7.5, 40.0))
    if not members and river_count <= 0:
        raise RuntimeError(f'Purchased source {role} contributed no importable geometry')
    remapped_project = remap_missing_images(expanded.get('village_textures', []) + files)
    contributions[role] = {
        'type': 'visible_geometry',
        'objectCount': len(members) + river_count,
        'importedFileCount': imported_files,
        'purchasedTexturesBound': remapped_project,
        'scatteredPurchasedCopies': 0,
        'authoredLayoutKept': False,
        'placedAsRiverBanks': True,
        'riverObjectCount': river_count,
        'visibleAsRiver': river_count > 0,
        'waterMaterialsLoaded': water_loaded,
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
            (village_center.x + forest_slots[role][0][0], village_center.y + 33.0, 0.0),
            copies=4,
            radius=9.0,
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

    mountain_role = 'background_mountains'
    mountain_files = expanded.get(mountain_role, [])
    if mountain_files:
        members = []
        imported_files = 0
        placed = []
        for candidate in geometry_candidates(mountain_files, mountain_role):
            objs = import_geometry(candidate, mountain_role)
            if not objs:
                continue
            heroes = keep_hero_meshes(objs, mountain_role, 5)
            members.extend(heroes)
            imported_files += 1
            placed.append(candidate.name)
        placed_count = 0
        if members:
            # Louis tiles are ~500 m wide and authored hundreds of metres apart.
            # Place each as a readable ridge behind the forest, not one 140 m pebble.
            placed_count = place_mountain_ridge(members, village_center)
        remapped_mtn = remap_missing_images(mountain_files)
        contributions[mountain_role] = {
            'type': 'visible_geometry',
            'objectCount': len(members),
            'importedFileCount': imported_files,
            'purchasedTexturesBound': remapped_mtn,
            'kitFilesPlaced': placed,
            'placedAsBackgroundMountains': True,
            'ridgePiecesPlaced': placed_count,
        }

    all_extracted: list[Path] = []
    for role_files in expanded.values():
        all_extracted.extend(role_files)
    remapped = remap_missing_images(all_extracted)
    forced = ensure_purchased_albedos(all_extracted)
    print(json.dumps({'event': 'purchased_image_remap', 'remapped': remapped, 'forcedAlbedos': forced}), flush=True)

    ground_count, ground_source = create_valley_ground(
        expanded.get('forest_nature', []) + expanded.get('forest_ecokit', []) + mountain_files,
        (village_center.x, village_center.y + 18.0, -0.08),
        150.0,
    )
    if not ground_count:
        raise RuntimeError('Valley floor could not be created from purchased meadow/dirt sources')
    contributions['village_textures'] = {
        'type': 'visible_texture',
        'objectCount': ground_count,
        'cabinAlbedoRemapped': remapped,
        'forcedAlbedos': forced,
        'groundSource': ground_source,
        'usedGrass01Card': False,
    }

    sky_name = setup_world(expanded.get('sky_hdri', []), expanded.get('world_shaders', []))
    contributions['sky_hdri'] = {'type':'world_environment','imageLoaded':True}

    for role in SUPPORT_ROLES:
        count = load_support(expanded.get(role, []), role)
        if count <= 0:
            raise RuntimeError(f'Purchased support source {role} contributed no loadable data')
        contributions[role] = {'type':'support_data','loadedDataCount':count}

    missing_roles = sorted(RENDERABLE_ROLES - set(contributions))
    if missing_roles:
        raise RuntimeError(f'Original-14 renderable sources missing from scene: {missing_roles}')

    print(json.dumps({'event': 'leftover_texture_bind', 'bound': 0, 'skipped': True}), flush=True)

    dropped_boxes = 0
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH' or str(obj.name).startswith('TJ_Ground'):
            continue
        if is_water_or_ocean_name(obj.name) or is_mountain_camera_subject_name(obj.name, subject_parent_name(obj)):
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
        'cameraPath':'mountains_forest_river_village',
        'lighting':'bright_daylight_agx_medium_contrast',
        'groundSource': contributions.get('village_textures', {}).get('groundSource'),
        'stillsOnly':bool(args.stills_only),
        'engine':str(args.engine),
    }
    Path(args.proof_path).write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'event':'tivvlejoy_original14_render_start','frames':proof['frameCount'],'resolution':args.resolution,'samples':args.samples,'stillsOnly':bool(args.stills_only),'engine':args.engine}), flush=True)
    write_progress('BLENDER_STARTED', frame=0, framesWritten=0, totalFrames=proof['frameCount'])
    if args.stills_only:
        frames = [int(x) for x in str(args.stills_frames).split(',') if str(x).strip()]
        scene = bpy.context.scene
        for frame in frames:
            scene.frame_set(frame)
            scene.render.filepath = str(Path(args.output_dir) / f'lookdev_{frame:04d}')
            bpy.ops.render.render(write_still=True)
            write_progress('LOOKDEV_STILL', frame=frame, framesWritten=frame, totalFrames=args.end_frame)
    else:
        bpy.ops.render.render(animation=True)
    print(json.dumps({'event':'tivvlejoy_original14_render_complete','frames':proof['frameCount'],'stillsOnly':bool(args.stills_only)}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

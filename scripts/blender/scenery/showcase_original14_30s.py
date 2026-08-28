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


def _mix_color_node(nodes, blend: str = 'MIX', fac: float = 0.5, color2=(1.0, 1.0, 1.0, 1.0)):
    try:
        mix = nodes.new('ShaderNodeMixRGB')
    except Exception:
        mix = nodes.new('ShaderNodeMix')
        if hasattr(mix, 'data_type'):
            mix.data_type = 'RGBA'
    mix.blend_type = blend
    if 'Fac' in mix.inputs:
        mix.inputs['Fac'].default_value = float(fac)
    if 'Color2' in mix.inputs:
        mix.inputs['Color2'].default_value = tuple(float(c) for c in color2[:3]) + (1.0,)
    return mix


def _mix_color_sockets(mix):
    color1 = mix.inputs['Color1'] if 'Color1' in mix.inputs else mix.inputs[6]
    color2 = mix.inputs['Color2'] if 'Color2' in mix.inputs else mix.inputs[7]
    out = mix.outputs['Color'] if 'Color' in mix.outputs else mix.outputs[2]
    return color1, color2, out


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
            if any(word in current for word in ('nrm', 'nor', 'spe', 'rough', 'metal', 'occ', 'ao_', 'emi')):
                continue
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
    sanitize_purchased_materials()
    if cabin is not None:
        for obj in bpy.data.objects:
            if obj.type != 'MESH' or not is_authored_village_mesh_name(obj.name):
                continue
            needs = False
            if not obj.data.materials:
                needs = True
            for slot in obj.material_slots:
                mat = slot.material
                if mat is None:
                    needs = True
                    continue
                blob = f'{mat.name} {obj.name}'.lower()
                if 'wood01' in blob or not mat.node_tree:
                    needs = True
            if not needs:
                continue
            mat = image_material(f'TJ_CabinAtlas_{obj.name}'[:55], Path(cabin.filepath) if cabin.filepath else None)
            if mat.node_tree:
                tex = next((n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE'), None)
                if tex is not None:
                    tex.image = cabin
            obj.data.materials.clear()
            obj.data.materials.append(mat)
            bound += 1
    return bound


def sanitize_purchased_materials() -> None:
    """Drop missing SPE/NRM links that crush cabin/tree shading to black."""
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        bsdf = next((node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            continue
        for name in ('Normal', 'Specular', 'Specular IOR Level', 'Roughness', 'Metallic'):
            if name not in bsdf.inputs:
                continue
            for link in list(bsdf.inputs[name].links):
                src = link.from_node
                img = getattr(src, 'image', None) if src.type == 'TEX_IMAGE' else None
                missing = False
                if src.type == 'TEX_IMAGE':
                    if img is None:
                        missing = True
                    elif not getattr(img, 'packed_file', None):
                        raw = str(getattr(img, 'filepath', '') or '')
                        try:
                            missing = not (Path(bpy.path.abspath(raw)).is_file() and Path(bpy.path.abspath(raw)).stat().st_size > 64)
                        except Exception:
                            missing = True
                    if img and any(word in img.name.lower() for word in ('_alb', 'alb.')):
                        missing = True
                if missing:
                    try:
                        mat.node_tree.links.remove(link)
                    except Exception:
                        pass
            if 'Roughness' in bsdf.inputs and not bsdf.inputs['Roughness'].links:
                bsdf.inputs['Roughness'].default_value = 0.48
            if 'Metallic' in bsdf.inputs and not bsdf.inputs['Metallic'].links:
                bsdf.inputs['Metallic'].default_value = 0.0


def lift_purchased_shading() -> int:
    """Keep straw roofs and log walls readable instead of crushed-black."""
    lifted = 0
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        blob = f'{mat.name}'.lower()
        bsdf = next((node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            continue
        roof = any(word in blob for word in ('straw', 'roof', 'thatch'))
        cabin = any(word in blob for word in ('cabin', 'building', 'wood')) and not roof
        if not roof and not cabin:
            continue
        if 'Base Color' not in bsdf.inputs:
            continue
        warm = (0.64, 0.50, 0.24, 1.0) if roof else (0.46, 0.32, 0.20, 1.0)
        mix = _mix_color_node(mat.node_tree.nodes, fac=0.36 if roof else 0.18, color2=warm)
        color1, _color2, color_out = _mix_color_sockets(mix)
        links = list(bsdf.inputs['Base Color'].links)
        if links:
            src = links[0].from_socket
            try:
                mat.node_tree.links.remove(links[0])
            except Exception:
                pass
            mat.node_tree.links.new(src, color1)
        else:
            color1.default_value = bsdf.inputs['Base Color'].default_value
        mat.node_tree.links.new(color_out, bsdf.inputs['Base Color'])
        if 'Roughness' in bsdf.inputs and not bsdf.inputs['Roughness'].links:
            bsdf.inputs['Roughness'].default_value = 0.70 if roof else 0.52
        if 'Specular IOR Level' in bsdf.inputs and not bsdf.inputs['Specular IOR Level'].links:
            bsdf.inputs['Specular IOR Level'].default_value = 0.18
        lifted += 1
    return lifted


def paint_simple_color(obj, name: str, color: tuple, roughness: float = 0.8) -> None:
    if obj is None or obj.type != 'MESH':
        return
    mat = bpy.data.materials.new(name[:60])
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf and 'Base Color' in bsdf.inputs:
        bsdf.inputs['Base Color'].default_value = (*[float(c) for c in color[:3]], 1.0)
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = float(roughness)
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def hide_or_paint_broken_trees() -> int:
    """FBX/dump trees with no albedo render paper-white. Paint them dark pine or hide."""
    fixed = 0
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            continue
        blob = f'{obj.name} {subject_parent_name(obj)}'.lower()
        if 'tree' not in blob and 'pine' not in blob and 'forest_' not in blob:
            continue
        if str(obj.name).startswith(('TJ_Ground', 'TJ_River')):
            continue
        has_img = any(material_has_valid_image(slot.material) for slot in obj.material_slots)
        if has_img:
            continue
        if 'forest_' in blob or 'dump' in blob or 'nature_kit' in blob:
            paint_simple_color(obj, f'TJ_ForestCanopy_{obj.name}', (0.07, 0.14, 0.06), 0.88)
            if hasattr(obj, 'visible_shadow'):
                obj.visible_shadow = False
        else:
            paint_simple_color(obj, f'TJ_PineFallback_{obj.name}', (0.10, 0.20, 0.08), 0.82)
        fixed += 1
    return fixed


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


def _dirt_or_rock_path(files: list[Path]) -> Path | None:
    banned = ('leaf', 'leaves', 'foliage', 'needles', 'grass01', 'cutout')
    candidates = [
        p for p in files
        if p.is_file()
        and p.suffix.lower() in IMAGE_EXTS
        and not is_grass_card_texture_name(p.name)
        and any(word in p.name.lower() for word in ('dirt', 'soil', 'moss', 'ground', 'meadow', 'terrain'))
        and not any(word in p.name.lower() for word in NON_ALBEDO_WORDS)
        and not any(word in p.name.lower() for word in banned)
    ]
    img_path = pick_ground_image_path(candidates) if candidates else None
    if img_path and any(word in img_path.name.lower() for word in banned):
        return None
    return img_path


def _meadow_or_dirt_material(name: str, img_path: Path | None, meadow: bool) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    out = nodes.new('ShaderNodeOutputMaterial')
    if 'Roughness' in bsdf.inputs:
        bsdf.inputs['Roughness'].default_value = 0.94 if meadow else 0.88
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.10
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    coord = nodes.new('ShaderNodeTexCoord')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 14.0 if meadow else 8.0
    if 'Detail' in noise.inputs:
        noise.inputs['Detail'].default_value = 4.0
    links.new(coord.outputs['Generated'], noise.inputs['Vector'])
    patch = _mix_color_node(
        nodes,
        fac=0.5,
        color2=(0.34, 0.48, 0.16, 1.0) if meadow else (0.28, 0.20, 0.12, 1.0),
    )
    c1, _c2, patch_out = _mix_color_sockets(patch)
    c1.default_value = (0.14, 0.22, 0.08, 1.0) if meadow else (0.40, 0.28, 0.15, 1.0)
    links.new(noise.outputs['Fac'], patch.inputs['Fac'] if 'Fac' in patch.inputs else patch.inputs[0])
    color_src = patch_out
    if img_path is not None:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(img_path), check_existing=True)
        if tex.image and tex.image.colorspace_settings:
            tex.image.colorspace_settings.name = 'sRGB'
        mapping = nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (0.045, 0.045, 0.045)
        links.new(coord.outputs['Object'], mapping.inputs['Vector'])
        links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
        grade = _mix_color_node(nodes, fac=0.82 if meadow else 0.55, color2=(0.26, 0.42, 0.14, 1.0) if meadow else (0.36, 0.26, 0.14, 1.0))
        g1, _g2, grade_out = _mix_color_sockets(grade)
        links.new(tex.outputs['Color'], g1)
        weave = _mix_color_node(nodes, fac=0.22 if meadow else 0.40)
        w1, w2, weave_out = _mix_color_sockets(weave)
        links.new(patch_out, w1)
        links.new(grade_out, w2)
        color_src = weave_out
    if meadow:
        sep = nodes.new('ShaderNodeSeparateXYZ')
        links.new(coord.outputs['Object'], sep.inputs['Vector'])
        abs_x = nodes.new('ShaderNodeMath')
        abs_x.operation = 'ABSOLUTE'
        links.new(sep.outputs['X'], abs_x.inputs[0])
        path_w = nodes.new('ShaderNodeMapRange')
        path_w.inputs['From Min'].default_value = 0.4
        path_w.inputs['From Max'].default_value = 2.6
        path_w.inputs['To Min'].default_value = 1.0
        path_w.inputs['To Max'].default_value = 0.0
        links.new(abs_x.outputs['Value'], path_w.inputs['Value'])
        # Keep the path only between river and village; fade outside with |Y+1|.
        y_center = nodes.new('ShaderNodeMath')
        y_center.operation = 'SUBTRACT'
        y_center.inputs[1].default_value = -1.0
        links.new(sep.outputs['Y'], y_center.inputs[0])
        y_abs = nodes.new('ShaderNodeMath')
        y_abs.operation = 'ABSOLUTE'
        links.new(y_center.outputs['Value'], y_abs.inputs[0])
        y_fade = nodes.new('ShaderNodeMapRange')
        y_fade.inputs['From Min'].default_value = 8.0
        y_fade.inputs['From Max'].default_value = 16.0
        y_fade.inputs['To Min'].default_value = 1.0
        y_fade.inputs['To Max'].default_value = 0.0
        links.new(y_abs.outputs['Value'], y_fade.inputs['Value'])
        path_fac = nodes.new('ShaderNodeMath')
        path_fac.operation = 'MULTIPLY'
        links.new(path_w.outputs['Result'] if 'Result' in path_w.outputs else path_w.outputs[0], path_fac.inputs[0])
        links.new(y_fade.outputs['Result'] if 'Result' in y_fade.outputs else y_fade.outputs[0], path_fac.inputs[1])
        dirt = _mix_color_node(nodes, fac=0.0, color2=(0.39, 0.27, 0.14, 1.0))
        d1, _d2, dirt_out = _mix_color_sockets(dirt)
        links.new(color_src, d1)
        links.new(path_fac.outputs['Value'], dirt.inputs['Fac'] if 'Fac' in dirt.inputs else dirt.inputs[0])
        color_src = dirt_out
    links.new(color_src, bsdf.inputs['Base Color'])
    return mat


def create_valley_ground(files: list[Path], center=(0.0, 16.0, -0.08), size: float = 140.0) -> tuple[int, str]:
    """Meadow floor with a dirt path. Never Grass01 cards. Keep the TJ_Ground prefix."""
    img_path = None
    source = 'meadow_noise+path'
    bpy.ops.mesh.primitive_plane_add(size=max(90.0, float(size)), location=center)
    ground = bpy.context.object
    ground.name = 'TJ_Ground_ValleyFloor_PurchasedMeadow'
    bpy.ops.object.mode_set(mode='EDIT')
    try:
        bpy.ops.mesh.subdivide(number_cuts=16)
        bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode='OBJECT')
    cx, cy, _cz = center
    for vert in ground.data.vertices:
        wx = cx + vert.co.x
        wy = cy + vert.co.y
        h = 0.22 * math.sin(vert.co.x * 0.10) * math.cos(vert.co.y * 0.07)
        if -8.0 <= wy <= 12.0 and abs(wx) < 18.0:
            h *= 0.12
        if -14.0 < wy < -6.0:
            h -= 0.20
        if wy > 50.0:
            h += min(1.6, (wy - 50.0) * 0.035)
        vert.co.z += h
    ground.data.update()
    ground.data.materials.append(_meadow_or_dirt_material('TJ_PurchasedValleyMeadow', img_path, meadow=True))
    return 1, source


def create_dirt_path(center=(0.0, -1.0, -0.045), size=(4.4, 26.0), files: list[Path] | None = None) -> int:
    img_path = _dirt_or_rock_path(files or [])
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=center)
    path = bpy.context.object
    path.name = 'TJ_Ground_DirtPath'
    path.scale = (max(size[0], 2.5), max(size[1], 8.0), 1.0)
    bpy.ops.object.mode_set(mode='EDIT')
    try:
        bpy.ops.mesh.subdivide(number_cuts=4)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode='OBJECT')
    path.data.materials.append(_meadow_or_dirt_material('TJ_PurchasedDirtPath', img_path, meadow=False))
    return 1


def _river_water_material() -> bpy.types.Material:
    water_mat = next((m for m in bpy.data.materials if m and str(m.name).startswith('Water_Mat')), None)
    mat = bpy.data.materials.new('TJ_PurchasedRiverWater')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    if bsdf is None:
        return mat
    if 'Base Color' in bsdf.inputs:
        bsdf.inputs['Base Color'].default_value = (0.07, 0.18, 0.22, 1.0)
    if 'Roughness' in bsdf.inputs:
        bsdf.inputs['Roughness'].default_value = 0.20
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.55
    if 'Transmission Weight' in bsdf.inputs:
        bsdf.inputs['Transmission Weight'].default_value = 0.28
    elif 'Transmission' in bsdf.inputs:
        bsdf.inputs['Transmission'].default_value = 0.28
    wave = nodes.new('ShaderNodeTexWave')
    wave.inputs['Scale'].default_value = 4.5
    if 'Distortion' in wave.inputs:
        wave.inputs['Distortion'].default_value = 2.2
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.18
    links.new(wave.outputs['Color'], bump.inputs['Height'])
    if 'Normal' in bsdf.inputs:
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    if water_mat is not None and water_mat.node_tree:
        src = next((n for n in water_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        # Keep our darker river grade. EcoKit Water_Mat defaults read as tape-blue.
    return mat


def create_river_banks(center=(0.0, -10.0, -0.02), files: list[Path] | None = None) -> int:
    img_path = _dirt_or_rock_path(files or [])
    created = 0
    for i, (name, y_off) in enumerate((('TJ_RiverBank_South', -3.4), ('TJ_RiverBank_North', 3.4))):
        bpy.ops.mesh.primitive_plane_add(size=1.0, location=(center[0], center[1] + y_off, -0.01))
        bank = bpy.context.object
        bank.name = name
        bank.scale = (46.0, 3.4, 1.0)
        bpy.ops.object.mode_set(mode='EDIT')
        try:
            bpy.ops.mesh.subdivide(number_cuts=3)
        except Exception:
            pass
        bpy.ops.object.mode_set(mode='OBJECT')
        for vert in bank.data.vertices:
            vert.co.z += 0.04 * math.sin(vert.co.x * math.pi * 2.0)
        bank.data.update()
        bank.data.materials.append(_meadow_or_dirt_material(f'TJ_PurchasedRiverBank_{i}', img_path, meadow=False))
        created += 1
    return created


def create_purchased_stream(center=(0.0, 16.0, -0.03), size=(8.0, 42.0)) -> int:
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=center)
    stream = bpy.context.object
    stream.name = 'TJ_River_From_Purchased_Water_Mat'
    # size is (width along X, length along Y) for an east-west river in front of the village.
    stream.scale = (max(size[0], 8.0), max(size[1], 3.0), 1.0)
    bpy.ops.object.mode_set(mode='EDIT')
    try:
        bpy.ops.mesh.subdivide(number_cuts=14)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode='OBJECT')
    try:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    except Exception:
        pass
    for vert in stream.data.vertices:
        # Vertices are now in metres. Bend the ribbon so it is not a canal.
        vert.co.y += 2.6 * math.sin(vert.co.x * 0.16)
        vert.co.x += 0.55 * math.sin(vert.co.y * 0.9)
    stream.data.update()
    bpy.context.view_layer.update()
    stream.data.materials.clear()
    stream.data.materials.append(_river_water_material())
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
            if hasattr(obj, 'visible_shadow'):
                obj.visible_shadow = False
            placed += 1
        except Exception as exc:
            print(json.dumps({'event': 'mountain_place_warning', 'object': obj.name, 'error': str(exc)[:160]}), flush=True)
    return placed


def enable_foliage_alpha(objects: list[bpy.types.Object]) -> int:
    marked = 0
    # Do not clip tree/pine atlases. That punched neon tips and crushed canopies.
    words = ('leaf', 'leaves', 'foliage', 'bush', 'grass', 'fern', 'plant')
    skip = ('tree', 'pine', 'canopy', 'trunk')
    for obj in objects:
        if not obj or obj.type != 'MESH':
            continue
        name = obj.name.lower()
        if any(word in name for word in skip) or not any(w in name for w in words):
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


def duplicate_mesh_in_world(src, location, scale: float = 1.0):
    """Copy a parented kit mesh into world space. Blender keeps the parent on copy()."""
    dup = src.copy()
    dup.data = src.data
    bpy.context.scene.collection.objects.link(dup)
    rot = src.matrix_world.to_euler()
    scl = src.matrix_world.to_scale()
    dup.parent = None
    try:
        dup.matrix_parent_inverse.identity()
    except Exception:
        pass
    dup.location = Vector(location)
    dup.rotation_euler = rot
    factor = float(scale)
    dup.scale = (scl.x * factor, scl.y * factor, scl.z * factor)
    return dup


def scatter_purchased_meshes(members: list[bpy.types.Object], origin: tuple, copies: int = 4, radius: float = 16.0) -> list[bpy.types.Object]:
    extras: list[bpy.types.Object] = []
    live = [o for o in members if o and o.name in bpy.data.objects and o.type == 'MESH']
    if not live or copies <= 0:
        return extras
    for i in range(copies):
        src = live[i % len(live)]
        try:
            ang = (i / max(copies, 1)) * math.tau
            loc = (
                origin[0] + math.cos(ang) * radius,
                origin[1] + math.sin(ang) * radius * 0.65,
                origin[2],
            )
            extras.append(duplicate_mesh_in_world(src, loc, 1.0))
        except Exception as exc:
            print(json.dumps({'event': 'scatter_warning', 'error': str(exc)[:180]}), flush=True)
    return extras


def scatter_forest_line(members: list[bpy.types.Object], origin: tuple, copies: int, width: float, depth: float, scale: float = 1.0) -> list[bpy.types.Object]:
    """Place a tree wall across the valley, not a ring around the cabins."""
    extras: list[bpy.types.Object] = []
    live = [o for o in members if o and o.name in bpy.data.objects and o.type == 'MESH']
    if not live or copies <= 0:
        return extras
    for i in range(copies):
        src = live[i % len(live)]
        try:
            t = (i + 0.37) / max(copies, 1)
            loc = (
                origin[0] + (t - 0.5) * width,
                origin[1] + math.sin(i * 1.73) * depth,
                origin[2],
            )
            extras.append(duplicate_mesh_in_world(src, loc, scale))
        except Exception as exc:
            print(json.dumps({'event': 'scatter_line_warning', 'error': str(exc)[:180]}), flush=True)
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
    bg.inputs['Strength'].default_value = 1.05
    out = nodes.new('ShaderNodeOutputWorld')
    color_out = mix.outputs['Color'] if 'Color' in mix.outputs else mix.outputs[2]
    links.new(color_out, bg.inputs['Color'])
    links.new(bg.outputs['Background'], out.inputs['Surface'])
    return image.name


def setup_lighting():
    # Soft south daylight: readable roofs and log walls, not crushed dusk.
    bpy.ops.object.light_add(type='SUN', location=(8, -36, 70))
    sun = bpy.context.object
    sun.name = 'TJ_Sun'
    sun.data.energy = 2.2
    sun.data.angle = math.radians(8.0)
    sun.rotation_euler = (math.radians(46), math.radians(2), math.radians(4))
    if hasattr(sun.data, 'use_shadow'):
        sun.data.use_shadow = True
    if hasattr(sun.data, 'color'):
        sun.data.color = (1.0, 0.96, 0.88)
    bpy.ops.object.light_add(type='AREA', location=(-16, -10, 30))
    fill = bpy.context.object
    fill.name = 'TJ_SkyFill'
    fill.data.energy = 3400
    fill.data.shape = 'DISK'
    fill.data.size = 56
    fill.rotation_euler = (math.radians(28), 0.0, math.radians(10))
    if hasattr(fill.data, 'color'):
        fill.data.color = (0.74, 0.86, 1.0)
    bpy.ops.object.light_add(type='AREA', location=(8, -18, 12))
    bounce = bpy.context.object
    bounce.name = 'TJ_GroundBounce'
    bounce.data.energy = 1600
    bounce.data.shape = 'RECTANGLE'
    bounce.data.size = 40
    if hasattr(bounce.data, 'size_y'):
        bounce.data.size_y = 28
    bounce.rotation_euler = (math.radians(90), 0.0, 0.0)
    if hasattr(bounce.data, 'color'):
        bounce.data.color = (1.0, 0.92, 0.74)
    bpy.ops.object.light_add(type='AREA', location=(0.0, -24.0, 16.0))
    key = bpy.context.object
    key.name = 'TJ_VillageKey'
    key.data.energy = 3600
    key.data.shape = 'RECTANGLE'
    key.data.size = 30
    if hasattr(key.data, 'size_y'):
        key.data.size_y = 18
    key.rotation_euler = (math.radians(58), 0.0, 0.0)
    if hasattr(key.data, 'color'):
        key.data.color = (1.0, 0.96, 0.84)
    bpy.ops.object.light_add(type='AREA', location=(0.0, 1.0, 22.0))
    roof = bpy.context.object
    roof.name = 'TJ_RoofFill'
    roof.data.energy = 2000
    roof.data.shape = 'RECTANGLE'
    roof.data.size = 22
    if hasattr(roof.data, 'size_y'):
        roof.data.size_y = 16
    roof.rotation_euler = (0.0, 0.0, 0.0)
    if hasattr(roof.data, 'color'):
        roof.data.color = (1.0, 0.94, 0.80)


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
        return 10.0
    if 'swarm' in name:
        return 14.0
    if 'rock' in name:
        return 5.5
    if 'tree' in name:
        return 16.0
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
            scene.view_settings.exposure = 0.36
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
        (-5.0, 0.5, 0.0), (1.5, 2.8, 0.0), (6.5, 0.0, 0.0), (-2.5, 6.0, 0.0),
        (8.5, 5.5, 0.0), (-9.0, 4.0, 0.0), (10.0, 3.0, 0.0), (0.5, 8.5, 0.0),
        (2.0, -4.5, 0.0), (-4.0, -3.5, 0.0),
    ]
    fbx_slots = [
        (3.2, -6.0, 0.0), (-3.4, -5.5, 0.0), (0.2, -3.2, 0.0),
        (6.5, -2.5, 0.0), (-6.8, -2.0, 0.0), (1.4, 1.5, 0.0),
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

    fbx_files = expanded.get('village_fbx', [])
    fbx_dressing = [
        p for p in fbx_files
        if p.is_file()
        and p.suffix.lower() in GEOMETRY_EXTS
        and any(word in p.name.lower() for word in ('fence', 'gate', 'cart'))
    ]
    if not fbx_dressing:
        raise RuntimeError('Purchased source village_fbx contributed no fence/gate/cart dressing')
    members, imported_files, placed = import_kit_groups(
        fbx_dressing,
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

    # Tree scatter waits until after albedo remap so authored pines are live.

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
            (-8.0, -12.0, 0.0), (8.0, -8.5, 0.0), (-3.0, -13.5, 0.0),
            (4.0, -7.0, 0.0), (0.0, -15.0, 0.0), (10.0, -11.0, 0.0),
        ]
        for i, obj in enumerate(members[:len(bank_slots)]):
            root = parent_group([obj], f'TJ_riverbank_{i}_{obj.name}'[:55])
            if root:
                normalize_group(root, [obj], 2.4, (
                    village_center.x + bank_slots[i][0],
                    village_center.y + bank_slots[i][1],
                    bank_slots[i][2],
                ))
            # Project flora reads as mint lumps in 9:16. Keep them loaded
            # for the usage proof, but do not put them in the hero strip.
            obj.hide_render = True
            obj.hide_viewport = True
    # Put the stream south of the village so a north-looking 9:16 camera
    # sees water in front of the cabins instead of hidden behind them.
    river_count = create_purchased_stream((village_center.x, village_center.y - 10.0, -0.03), (40.0, 4.4))
    bank_count = 0
    if not members and river_count <= 0:
        raise RuntimeError(f'Purchased source {role} contributed no importable geometry')
    remapped_project = remap_missing_images(expanded.get('village_textures', []) + files)
    contributions[role] = {
        'type': 'visible_geometry',
        'objectCount': len(members) + river_count + bank_count,
        'importedFileCount': imported_files,
        'purchasedTexturesBound': remapped_project,
        'scatteredPurchasedCopies': 0,
        'authoredLayoutKept': False,
        'placedAsRiverBanks': True,
        'riverObjectCount': river_count,
        'riverBankCount': bank_count,
        'visibleAsRiver': river_count > 0,
        'waterMaterialsLoaded': water_loaded,
    }

    for role in ('forest_nature', 'forest_ecokit'):
        files = expanded.get(role, [])
        if role == 'forest_ecokit':
            files = [
                p for p in files
                if 'swarm' not in p.name.lower()
                and 'suzanne' not in p.name.lower()
                and 'water' not in p.name.lower()
            ]
        members, imported_files, placed = import_kit_groups(
            files,
            role,
            forest_slots[role],
            village_center,
            MAX_MESHES_PER_ROLE,
        )
        if not members:
            raise RuntimeError(f'Purchased source {role} contributed no importable geometry')
        extras: list[bpy.types.Object] = []
        bound = 0
        if role == 'forest_nature':
            # Combined dump has no extractable 4k foliage (over the image cap).
            # Paint it as a dark canopy mass; do not rebind leaf cards or scatter copies.
            for obj in members:
                if obj.type != 'MESH':
                    continue
                paint_simple_color(obj, f'TJ_ForestCanopy_{obj.name}', (0.07, 0.15, 0.07), 0.9)
                if hasattr(obj, 'visible_shadow'):
                    obj.visible_shadow = False
                bound += 1
            roots = {obj.parent for obj in members if obj.parent}
            for root in roots:
                try:
                    root.scale = (root.scale[0] * 2.3, root.scale[1] * 2.3, root.scale[2] * 2.3)
                    root.location.y = village_center.y + 32.0
                except Exception:
                    pass
        else:
            live = [
                o for o in members
                if o.type == 'MESH' and 'swarm' not in o.name.lower() and 'water' not in o.name.lower()
            ]
            for obj in members:
                if 'swarm' in obj.name.lower() or 'water' in obj.name.lower():
                    obj.hide_render = True
                    obj.hide_viewport = True
            extras = scatter_forest_line(live, (village_center.x, village_center.y - 11.4, 0.0), 8, 32.0, 1.0, 0.55)
            extras += scatter_forest_line(live, (village_center.x, village_center.y - 8.2, 0.0), 8, 32.0, 1.0, 0.55)
            for obj in extras:
                paint_simple_color(obj, f'TJ_RiverRock_{obj.name}', (0.26, 0.20, 0.14), 0.88)
            members.extend(extras)
            # Keep authored rock materials. Only bind when a mesh has nothing.
            bound = bind_purchased_textures(live, files)
        contributions[role] = {
            'type': 'visible_geometry',
            'objectCount': len(members),
            'importedFileCount': imported_files,
            'purchasedTexturesBound': bound,
            'scatteredPurchasedCopies': len(extras),
            'authoredLayoutKept': False,
            'kitFilesPlaced': placed,
            'usedAsCanopyMass': role == 'forest_nature',
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
    lifted = lift_purchased_shading()
    village_trees = [
        o for o in bpy.data.objects
        if o.type == 'MESH' and 'tree' in o.name.lower()
        and not is_forest_camera_subject_name(o.name, subject_parent_name(o))
        and 'fbx' not in subject_parent_name(o).lower()
        and 'forest_' not in subject_parent_name(o).lower()
    ]
    # Keep grove copies north of the cabins so they do not stab through roofs.
    grove = scatter_purchased_meshes(village_trees, (village_center.x, village_center.y + 12.0, 0.0), copies=4, radius=5.0)
    near_band = scatter_forest_line(village_trees, (village_center.x, village_center.y + 28.0, 0.0), 16, 44.0, 4.0, 1.55)
    far_band = scatter_forest_line(village_trees, (village_center.x, village_center.y + 42.0, 0.0), 16, 50.0, 5.0, 1.85)
    forest_band = grove + near_band + far_band
    for obj in forest_band:
        if hasattr(obj, 'visible_shadow'):
            obj.visible_shadow = False
    print(json.dumps({
        'event': 'purchased_image_remap',
        'remapped': remapped,
        'forcedAlbedos': forced,
        'liftedShading': lifted,
    }), flush=True)
    print(json.dumps({
        'event': 'village_tree_forest_band',
        'copies': len(forest_band),
        'sourceTrees': len(village_trees),
    }), flush=True)
    if 'village_blender' in contributions:
        contributions['village_blender']['scatteredPurchasedCopies'] = len(forest_band)

    ground_files = expanded.get('forest_nature', []) + expanded.get('forest_ecokit', []) + mountain_files
    ground_count, ground_source = create_valley_ground(
        ground_files,
        (village_center.x, village_center.y + 18.0, -0.08),
        150.0,
    )
    path_count = 0
    if not ground_count:
        raise RuntimeError('Valley floor could not be created from purchased meadow/dirt sources')
    contributions['village_textures'] = {
        'type': 'visible_texture',
        'objectCount': ground_count,
        'cabinAlbedoRemapped': remapped,
        'forcedAlbedos': forced,
        'groundSource': ground_source,
        'usedGrass01Card': False,
        'dirtPathCount': path_count,
        'liftedShading': lifted,
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
        if obj.type != 'MESH' or str(obj.name).startswith(('TJ_Ground', 'TJ_River', 'TJ_Atmosphere')):
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

    broken_trees = hide_or_paint_broken_trees()
    print(json.dumps({'event': 'broken_tree_fallback', 'count': broken_trees}), flush=True)
    hidden_props = 0
    for obj in list(bpy.data.objects):
        blob = f'{obj.name} {subject_parent_name(obj)}'.lower()
        if any(word in blob for word in ('suzanne', 'monkey', 'butterfly', 'swarm')):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden_props += 1
    print(json.dumps({'event': 'hidden_ecokit_props', 'count': hidden_props}), flush=True)

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
        'lighting':'soft_south_daylight_agx_medium_contrast',
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

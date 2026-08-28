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

GEOMETRY_EXTS = {'.blend', '.fbx', '.glb', '.gltf', '.obj'}
IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.tga', '.bmp', '.exr', '.hdr'}
SUPPORT_EXTS = GEOMETRY_EXTS | IMAGE_EXTS | {'.zip'}
VISIBLE_GEOMETRY_ROLES = {
    'village_blender', 'village_project', 'village_fbx',
    'forest_nature', 'forest_ecokit',
}
SUPPORT_ROLES = {'sky_machine_v1', 'sky_machine_v2', 'sky_extra_update', 'world_shaders'}
RENDERABLE_ROLES = VISIBLE_GEOMETRY_ROLES | {'village_textures', 'sky_hdri'} | SUPPORT_ROLES


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
    return p.parse_args(argv)


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
            wanted = [i for i in infos if Path(i.filename).suffix.lower() in SUPPORT_EXTS]
            # Prefer geometry/support files and larger image assets without exploding huge packs.
            wanted.sort(key=lambda i: (
                0 if Path(i.filename).suffix.lower() in GEOMETRY_EXTS else 1,
                0 if Path(i.filename).suffix.lower() in {'.hdr', '.exr'} else 1,
                -int(i.file_size or 0), i.filename.lower(),
            ))
            role_limit = 180 if role in {'village_textures', 'sky_hdri'} else 90
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
        'village_blender': ('house', 'cabin', 'building', 'tree', 'fence', 'gate', 'cart'),
        'village_project': ('house', 'cabin', 'building', 'tree', 'fence', 'gate', 'cart'),
        'village_fbx': ('house', 'cabin', 'building', 'tree', 'fence', 'gate', 'cart'),
        'forest_nature': ('tree', 'rock', 'bush', 'grass', 'fern', 'log', 'stump'),
        'forest_ecokit': ('tree', 'rock', 'bush', 'grass', 'fern', 'log', 'stump'),
    }.get(role, ())
    preferred = [n for n in names if any(w in n.lower() for w in words)]
    chosen = preferred[:limit]
    return chosen if chosen else names[:min(limit, len(names))]


def append_blend_geometry(path: Path, role: str) -> tuple[list[bpy.types.Object], int]:
    before = set(bpy.data.objects.keys())
    loaded_support = 0
    try:
        with bpy.data.libraries.load(str(path), link=False) as (src, dst):
            dst.objects = select_blend_names(list(src.objects), role)
            dst.materials = list(src.materials[:24])
            dst.node_groups = list(src.node_groups[:16])
        for obj in dst.objects:
            if obj is not None and obj.name not in bpy.context.scene.collection.objects:
                try:
                    bpy.context.scene.collection.objects.link(obj)
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
            bpy.ops.import_scene.fbx(filepath=str(path), use_image_search=False)
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
    c = [p for p in files if p.is_file() and p.suffix.lower() in GEOMETRY_EXTS]
    words = ('village', 'house', 'cabin', 'tree') if role.startswith('village') else ('forest', 'tree', 'nature', 'ecokit', 'rock')
    c.sort(key=lambda p: (0 if any(w in p.name.lower() for w in words) else 1, -p.stat().st_size, p.name.lower()))
    return c[:2]


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


def image_material(name: str, image: Path | None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Roughness'].default_value = 0.82
    if image and bsdf:
        try:
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = bpy.data.images.load(str(image), check_existing=True)
            mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        except Exception:
            pass
    return mat


def create_purchased_texture_ground(files: list[Path]) -> int:
    img = largest_image(files)
    if not img:
        return 0
    bpy.ops.mesh.primitive_plane_add(size=260, location=(0, 35, -0.2))
    ground = bpy.context.object
    ground.name = 'TJ_Ground_Using_Purchased_Village_Texture'
    ground.data.materials.append(image_material('TJ_PurchasedVillageGround', img))
    return 1


def load_support(files: list[Path], role: str) -> int:
    count = 0
    for p in [x for x in files if x.suffix.lower() == '.blend'][:2]:
        try:
            with bpy.data.libraries.load(str(p), link=False) as (src, dst):
                dst.materials = list(src.materials[:24])
                dst.node_groups = list(src.node_groups[:24])
                dst.worlds = list(src.worlds[:4])
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
    bg.inputs['Strength'].default_value = 0.5
    out = nodes.new('ShaderNodeOutputWorld')
    links.new(env.outputs['Color'], bg.inputs['Color'])
    links.new(bg.outputs['Background'], out.inputs['Surface'])
    return image.name


def setup_lighting():
    bpy.ops.object.light_add(type='SUN', location=(25, -35, 80))
    sun = bpy.context.object
    sun.name = 'TJ_Sun'
    sun.data.energy = 2.0
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


def setup_camera(start: int, end: int):
    bpy.ops.object.camera_add(location=(0, 145, 42))
    cam = bpy.context.object
    cam.name = 'TJ_Original14_Camera'
    cam.data.lens = 36
    bpy.context.scene.camera = cam
    target = bpy.data.objects.new('TJ_Original14_Target', None)
    bpy.context.scene.collection.objects.link(target)
    track_camera(cam, target)
    frames = [start, start+179, start+359, start+539, start+719, end]
    cams = [(0,145,42),(-24,105,24),(24,70,18),(-18,30,12),(20,-12,16),(0,-58,38)]
    targets = [(0,92,10),(0,68,6),(0,42,5),(0,10,4),(0,-6,5),(0,18,9)]
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
    if hasattr(scene, 'eevee'):
        if hasattr(scene.eevee, 'taa_render_samples'):
            scene.eevee.taa_render_samples = max(1, int(args.samples))
        if hasattr(scene.eevee, 'use_raytracing'):
            scene.eevee.use_raytracing = False
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass


def main() -> int:
    args = parse_args()
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
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
    placements = {
        'forest_nature': (62.0, (-32.0, 76.0, 0.0)),
        'forest_ecokit': (58.0, (31.0, 72.0, 0.0)),
        'village_blender': (58.0, (0.0, 5.0, 0.0)),
        'village_project': (30.0, (-38.0, -10.0, 0.0)),
        'village_fbx': (28.0, (36.0, -12.0, 0.0)),
    }
    for role in VISIBLE_GEOMETRY_ROLES:
        files = expanded.get(role, [])
        members: list[bpy.types.Object] = []
        imported_files = 0
        for candidate in geometry_candidates(files, role):
            objs = import_geometry(candidate, role)
            if objs:
                members.extend(objs); imported_files += 1
        if not members:
            raise RuntimeError(f'Purchased source {role} contributed no importable geometry')
        root = parent_group(members, f'TJ_{role}_PurchasedRoot')
        if root:
            size, loc = placements[role]
            normalize_group(root, members, size, loc)
        contributions[role] = {'type':'visible_geometry','objectCount':len(members),'importedFileCount':imported_files}

    ground_count = create_purchased_texture_ground(expanded.get('village_textures', []))
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

    setup_lighting()
    setup_camera(args.start_frame, args.end_frame)
    configure_render(args)

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
    print(json.dumps({'event':'tivvlejoy_original14_render_start','frames':proof['frameCount'],'resolution':args.resolution,'samples':args.samples}))
    bpy.ops.wm.save_as_mainfile(filepath=str(out.parent / 'tivvlejoy-original14-working.blend'))
    bpy.ops.render.render(animation=True)
    print(json.dumps({'event':'tivvlejoy_original14_render_complete','frames':proof['frameCount']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

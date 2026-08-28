"""Pure Original-14 extract/import ranking helpers (no Blender import).

The failed paid attempt imported the combined Stylized_Forest_Nature_Kit.obj
dump. Frame 1 took ~6.25 minutes at 540x960 / 12 samples, so 900 frames could
not finish inside the 55-minute Blender timeout. These helpers prefer
individual purchased assets and keep combined dumps as a last resort.
"""
from __future__ import annotations

from pathlib import Path

GEOMETRY_EXTS = {'.blend', '.fbx', '.glb', '.gltf', '.obj'}
IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.tga', '.bmp', '.exr', '.hdr'}
SUPPORT_EXTS = GEOMETRY_EXTS | IMAGE_EXTS | {'.zip', '.mtl'}

EXT_RANK = {'.blend': 0, '.fbx': 1, '.glb': 2, '.gltf': 3, '.obj': 4}

DUMP_MARKERS = (
    'stylized_forest_nature_kit',
    'nature_kit.obj',
    'full_scene',
    'fullscene',
    'combined_scene',
    'entire_scene',
)

# FBX/OBJ kits often include gray staging slabs that survived the first
# complete render and made the cut look like a debug layout.
STAGING_MARKERS = (
    'platform',
    'staging',
    'helper',
    'collider',
    'collision',
    'ucx_',
    'ubx_',
    'lod_box',
    'boundingbox',
    'debug_floor',
)

ALBEDO_WORDS = ('albedo', 'diffuse', 'diff', 'basecolor', 'base_color', 'color', 'col_')
NON_ALBEDO_WORDS = (
    'normal', 'nrm', 'norm_', '_n.', 'rough', 'metal', 'spec', 'ao_', 'occlusion',
    'height', 'bump', 'disp', 'emiss', 'mask', 'orm',
)

# High-contrast leaf/claw tiles looked like a debug floor in the camera-framing
# COMPLETE. Prefer real grass/dirt albedos and demote pattern/leaf maps.
PREFERRED_GROUND_WORDS = ('grass', 'dirt', 'soil', 'moss', 'ground')
GROUND_WORDS = PREFERRED_GROUND_WORDS + (
    'cobble', 'path', 'forest', 'village', 'road', 'sand',
)
PENALTY_GROUND_WORDS = (
    'leaf', 'bark', 'pattern', 'stencil', 'checker', 'tile_test', 'debug',
    'noise', 'alpha', 'opacity', 'detail',
)

PRIMITIVE_MARKERS = (
    'defaultcube', 'solidbox', 'proxy_box', 'dummy', 'placeholder',
    'bounding', 'volume_box',
)
PRIMITIVE_EXACT = {
    'cube', 'box', 'plane', 'grid', 'nurbs', 'circle', 'ico', 'suzanne', 'monkey',
}


def is_primitive_name(name: str) -> bool:
    n = str(name or '').lower().replace('\\', '/')
    stem = Path(n).stem.split('.')[0]
    if stem in PRIMITIVE_EXACT:
        return True
    return any(marker in n for marker in PRIMITIVE_MARKERS)


def is_box_mesh(face_count: int = 0, dimensions: tuple | None = None) -> bool:
    faces = int(face_count or 0)
    if faces > 14:
        return False
    if not dimensions or len(dimensions) < 3:
        return faces <= 8
    vals = [abs(float(x)) for x in dimensions[:3]]
    mx = max(vals) if vals else 0.0
    positives = [v for v in vals if v > 1e-6]
    mn = min(positives) if positives else 0.001
    return mx / mn < 2.8


# Combined dump OBJs expand into multi-GB render scenes even when the file
# itself is modest. Keep individual assets; allow larger .blend village files.
MAX_EXTRACT_BYTES = {
    '.blend': 180 * 1024 * 1024,
    '.fbx': 48 * 1024 * 1024,
    '.glb': 48 * 1024 * 1024,
    '.gltf': 24 * 1024 * 1024,
    '.obj': 12 * 1024 * 1024,
    '.hdr': 48 * 1024 * 1024,
    '.exr': 48 * 1024 * 1024,
    '.png': 20 * 1024 * 1024,
    '.jpg': 20 * 1024 * 1024,
    '.jpeg': 20 * 1024 * 1024,
}

HERO_WORDS = {
    'village_blender': ('house', 'cabin', 'building', 'tree', 'fence', 'gate', 'cart', 'village'),
    'village_project': ('house', 'cabin', 'building', 'tree', 'fence', 'gate', 'cart', 'village'),
    'village_fbx': ('house', 'cabin', 'building', 'tree', 'fence', 'gate', 'cart', 'village'),
    'forest_nature': ('tree', 'rock', 'bush', 'grass', 'fern', 'log', 'stump', 'pine'),
    'forest_ecokit': ('tree', 'rock', 'bush', 'grass', 'fern', 'log', 'stump', 'pine'),
}


def is_dump_name(name: str) -> bool:
    n = str(name or '').lower().replace('\\', '/')
    return any(marker in n for marker in DUMP_MARKERS)


def is_staging_name(name: str) -> bool:
    n = str(name or '').lower().replace('\\', '/')
    return any(marker in n for marker in STAGING_MARKERS)


def extract_role_limit(role: str) -> int:
    if role == 'sky_hdri':
        return 8
    if role == 'village_textures':
        return 16
    if role in {'forest_nature', 'forest_ecokit'}:
        return 24
    if role in {'village_fbx', 'village_blender', 'village_project'}:
        return 28
    if role in {'sky_machine_v1', 'sky_machine_v2', 'sky_extra_update', 'world_shaders'}:
        return 12
    return 24


def geometry_file_limit(role: str) -> int:
    # Camera-framing COMPLETE finished in ~7 minutes at 540x960 / 12 samples,
    # so one extra forest file and a third village file still fit the timeout
    # while filling the empty platform look.
    if role in {'forest_nature', 'forest_ecokit'}:
        return 2
    if role == 'village_blender':
        return 1
    if role in {'village_project', 'village_fbx'}:
        return 2
    return 1


def should_extract_member(filename: str, file_size: int, role: str) -> bool:
    ext = Path(str(filename)).suffix.lower()
    if ext not in SUPPORT_EXTS:
        return False
    size = int(file_size or 0)
    cap = MAX_EXTRACT_BYTES.get(ext)
    if cap is not None and size > cap:
        # Last-resort: still extract one modest dump OBJ if it is the only geometry.
        if ext == '.obj' and is_dump_name(filename) and size <= 80 * 1024 * 1024:
            return role in {'forest_nature', 'forest_ecokit'}
        return False
    return True


def extract_sort_key(filename: str, file_size: int) -> tuple:
    path = Path(str(filename).replace('\\', '/'))
    ext = path.suffix.lower()
    name = path.name.lower()
    geo = 0 if ext in GEOMETRY_EXTS else 1
    hdri = 0 if ext in {'.hdr', '.exr', '.jpg', '.jpeg'} else 1
    dump = 1 if is_dump_name(name) else 0
    staging = 1 if is_staging_name(name) else 0
    albedo_miss = 0 if (ext not in IMAGE_EXTS or any(w in name for w in ALBEDO_WORDS + GROUND_WORDS)) else 1
    ext_rank = EXT_RANK.get(ext, 8)
    # Prefer smaller geometry so individual trees/houses win over combined dumps.
    return (geo, dump, staging, ext_rank, hdri, albedo_miss, int(file_size or 0), name)


def mesh_keep_rank(name: str, role: str, face_count: int = 0, dimensions: tuple | None = None) -> tuple:
    n = str(name or '').lower()
    words = HERO_WORDS.get(role, ())
    staging = 1 if is_staging_name(n) else 0
    primitive = 1 if is_primitive_name(n) or is_box_mesh(face_count, dimensions) else 0
    flat = 0
    if dimensions and len(dimensions) >= 3:
        mx = max(dimensions)
        mn = min(dimensions)
        if mx > 3 and mn < 0.22 * max(mx, 0.001):
            flat = 1
    hero_miss = 0 if (not words or any(w in n for w in words)) else 1
    return (staging, primitive, flat, hero_miss, -int(face_count or 0), n)


def pick_ground_image_records(records: list[dict]) -> dict | None:
    images = [r for r in records if str(r.get('ext') or '').lower() in IMAGE_EXTS]

    def rank(rec: dict) -> tuple:
        name = str(rec.get('name') or '').lower()
        size = int(rec.get('size') or 0)
        non_albedo = 1 if any(w in name for w in NON_ALBEDO_WORDS) else 0
        penalty = 1 if any(w in name for w in PENALTY_GROUND_WORDS) else 0
        preferred_miss = 0 if any(w in name for w in PREFERRED_GROUND_WORDS) else 1
        ground_hit = 0 if any(w in name for w in GROUND_WORDS) else 1
        albedo_miss = 0 if any(w in name for w in ALBEDO_WORDS + GROUND_WORDS) else 1
        return (non_albedo, penalty, preferred_miss, ground_hit, albedo_miss, -min(size, 6 * 1024 * 1024), name)

    images.sort(key=rank)
    return images[0] if images else None


def pick_geometry_records(records: list[dict], role: str, limit: int = 1) -> list[dict]:
    words = HERO_WORDS.get(role, ())
    geo = [r for r in records if str(r.get('ext') or '').lower() in GEOMETRY_EXTS]

    def rank(rec: dict) -> tuple:
        name = str(rec.get('name') or '').lower()
        ext = str(rec.get('ext') or '').lower()
        size = int(rec.get('size') or 0)
        word_miss = 0 if (not words or any(w in name for w in words)) else 1
        dump = 1 if is_dump_name(name) else 0
        staging = 1 if is_staging_name(name) else 0
        if str(role).startswith('village'):
            blend_miss = 0 if ext == '.blend' else 1
            scene_miss = 0 if any(token in name for token in ('village', 'scene', 'full')) else 1
            # Prefer the authored village .blend over the smallest leftover FBX.
            return (dump, staging, blend_miss, scene_miss, word_miss, -size, name)
        return (dump, staging, word_miss, EXT_RANK.get(ext, 9), size, name)

    geo.sort(key=rank)
    preferred = [r for r in geo if not is_dump_name(str(r.get('name') or '')) and not is_staging_name(str(r.get('name') or ''))]
    chosen = (preferred or [r for r in geo if not is_dump_name(str(r.get('name') or ''))] or geo)[: max(1, int(limit))]
    return chosen


def pick_geometry_paths(paths: list[Path], role: str, limit: int = 1) -> list[Path]:
    records = []
    for path in paths:
        if not getattr(path, 'is_file', lambda: False)():
            continue
        ext = path.suffix.lower()
        if ext not in GEOMETRY_EXTS:
            continue
        records.append({'path': path, 'name': path.name, 'ext': ext, 'size': path.stat().st_size})
    return [rec['path'] for rec in pick_geometry_records(records, role, limit)]


def pick_ground_image_path(paths: list[Path]) -> Path | None:
    records = []
    for path in paths:
        if not getattr(path, 'is_file', lambda: False)():
            continue
        ext = path.suffix.lower()
        if ext not in IMAGE_EXTS:
            continue
        records.append({'path': path, 'name': path.name, 'ext': ext, 'size': path.stat().st_size})
    chosen = pick_ground_image_records(records)
    return chosen['path'] if chosen else None

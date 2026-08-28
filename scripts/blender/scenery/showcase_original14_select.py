"""Pure Original-14 extract/import ranking helpers (no Blender import).

The failed paid attempt imported the combined Stylized_Forest_Nature_Kit.obj
dump. Frame 1 took ~6.25 minutes at 540x960 / 12 samples, so 900 frames could
not finish inside the 55-minute Blender timeout. These helpers prefer
individual purchased assets and keep combined dumps as a last resort.
"""
from __future__ import annotations

import math
import re
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

ALBEDO_WORDS = ('albedo', 'diffuse', 'diff', 'basecolor', 'base_color', 'color', 'col_', '_alb', 'alb.')
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
    'noise', 'alpha', 'opacity', 'detail', 'grass01', 'mask', 'cutout',
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


def is_dominating_plane(face_count: int = 0, dimensions: tuple | None = None) -> bool:
    """Huge authored water/ground slabs steal camera bounds and empty the shot."""
    if not dimensions or len(dimensions) < 3:
        return False
    vals = sorted(abs(float(x)) for x in dimensions[:3])
    mn, _mid, mx = vals
    return mx >= 12.0 and mn <= max(0.5, 0.12 * mx)


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
    'village_blender': ('house', 'cabin', 'building', 'roof', 'cottage', 'hut', 'tree', 'fence', 'gate', 'cart', 'village'),
    'village_project': ('house', 'cabin', 'building', 'roof', 'tree', 'rock', 'flora', 'bush', 'village'),
    'village_fbx': ('house', 'cabin', 'building', 'roof', 'cottage', 'hut', 'tree', 'fence', 'gate', 'cart', 'village'),
    'forest_nature': ('tree', 'rock', 'bush', 'grass', 'fern', 'log', 'stump', 'pine'),
    'forest_ecokit': ('tree', 'rock', 'bush', 'grass', 'fern', 'log', 'stump', 'pine'),
    'background_mountains': ('mountain', 'range', 'peak', 'ridge', 'cliff', 'grassy', 'meadow'),
}

# Individual kit pieces from Village (Blender 4.2.2).zip / Village (FBX).zip.
# Cabin*A files are the full LOD buildings; interiors are props, not the village.
VILLAGE_OUTDOOR_WORDS = ('cabin', 'tree', 'fence', 'gate', 'cart', 'house', 'building', 'village', 'roof')
VILLAGE_INTERIOR_WORDS = (
    'bed', 'book', 'chair', 'candle', 'table', 'shelf', 'nightstand',
    'crate', 'barrel', 'bucket', 'rack',
)
FOLIAGE_CARD_WORDS = (
    'lily', 'lilypad', 'lily_pad', 'lotus', 'petal', 'umbrella',
)
BANK_FLORA_WORDS = ('floral', 'flora', 'leaf blade', 'fallen leaf', 'branch', 'bush')
WATER_WORDS = ('water', 'ocean', 'sea_', '_sea', 'lake', 'river')
CAMERA_HERO_WORDS = (
    'building', 'cabin', 'house', 'roof', 'cottage', 'hut',
    'tree', 'rock', 'log', 'fence', 'gate', 'cart',
    'mountain', 'range', 'peak', 'ridge',
)


def is_high_lod_name(name: str) -> bool:
    return bool(re.search(r'lod[1-3]\b', str(name or '').lower()))


def is_cabin_a_name(name: str) -> bool:
    return bool(re.search(r'cabin\d+a\b', str(name or '').lower()))


def is_village_outdoor_name(name: str) -> bool:
    n = str(name or '').lower()
    return any(word in n for word in VILLAGE_OUTDOOR_WORDS)


def is_village_interior_name(name: str) -> bool:
    n = str(name or '').lower()
    if is_cabin_a_name(n) or 'cabin' in n:
        return False
    return any(word in n for word in VILLAGE_INTERIOR_WORDS)


def is_foliage_card_name(name: str) -> bool:
    n = str(name or '').lower()
    return any(word in n for word in FOLIAGE_CARD_WORDS)


def is_bank_flora_name(name: str) -> bool:
    n = str(name or '').lower()
    if is_foliage_card_name(n):
        return False
    return any(word in n for word in BANK_FLORA_WORDS)


def is_grass_card_texture_name(name: str) -> bool:
    n = str(name or '').lower()
    return any(word in n for word in ('grass01', 'cutout', 'stencil', 'mask'))


def is_water_or_ocean_name(name: str) -> bool:
    n = str(name or '').lower()
    return any(word in n for word in WATER_WORDS)


def is_camera_hero_name(name: str) -> bool:
    n = str(name or '').lower()
    if is_foliage_card_name(n) or is_water_or_ocean_name(n):
        return False
    return any(word in n for word in CAMERA_HERO_WORDS)


def is_authored_village_mesh_name(name: str) -> bool:
    n = str(name or '').lower()
    return any(word in n for word in ('building', 'roof', 'cabin', 'house', 'cottage', 'hut'))


CABIN_TEXTURE_WORDS = ('wood', 'log', 'cabin', 'roof', 'thatch', 'plank', 'bark', 'wall', 'shingle')


def is_cabin_texture_name(name: str) -> bool:
    n = str(name or '').lower()
    return any(word in n for word in CABIN_TEXTURE_WORDS)


def village_orbit_radius(rx: float, ry: float) -> float:
    """Keep every camera keyframe outside the village AABB."""
    half = math.hypot(max(rx, 4.0), max(ry, 4.0))
    return min(max(half + max(10.0, 0.55 * max(rx, ry, 4.0)), 16.0), 36.0)


def is_village_camera_subject_name(name: str, parent_name: str = '') -> bool:
    """Cabin/cart/fence kit pieces belong to the village; forest kit does not."""
    blob = f'{parent_name} {name}'.lower()
    if 'forest_' in blob or 'ecokit' in blob:
        return False
    if 'village_project' in blob:
        return False
    if 'village' in blob:
        return True
    return is_authored_village_mesh_name(name) or any(
        word in str(name or '').lower() for word in ('cart', 'fence', 'gate')
    )


def is_forest_camera_subject_name(name: str, parent_name: str = '') -> bool:
    blob = f'{parent_name} {name}'.lower()
    return 'forest_' in blob or 'ecokit' in blob


def is_mountain_camera_subject_name(name: str, parent_name: str = '') -> bool:
    blob = f'{parent_name} {name}'.lower()
    return 'mountain' in blob or 'background_mountains' in blob


def point_outside_aabb(
    x: float,
    y: float,
    min_x: float,
    min_y: float,
    max_x: float,
    max_y: float,
    pad: float = 6.0,
) -> tuple[float, float]:
    """Push a camera XY outside the padded village AABB so we never clip inside."""
    inside_x = (min_x - pad) <= x <= (max_x + pad)
    inside_y = (min_y - pad) <= y <= (max_y + pad)
    if not (inside_x and inside_y):
        return (float(x), float(y))
    cx = (min_x + max_x) * 0.5
    cy = (min_y + max_y) * 0.5
    rx = max((max_x - min_x) * 0.5, 4.0)
    ry = max((max_y - min_y) * 0.5, 4.0)
    vx, vy = x - cx, y - cy
    n = math.hypot(vx, vy)
    if n < 1e-6:
        vx, vy, n = 0.0, -1.0, 1.0
    extra = max(rx, ry) + pad + 2.0
    return (cx + vx / n * extra, cy + vy / n * extra)


def cinematic_camera_keys(
    min_x: float,
    min_y: float,
    max_x: float,
    max_y: float,
    min_z: float,
    vert: float,
    forest_x: float | None = None,
    forest_y: float | None = None,
    forest_z: float | None = None,
) -> list[dict]:
    """Village establish → street → cabins → forest edge → trees → crane-up sky.

    Camera XY stays outside the village AABB. Look targets may sit inside the
    cluster so the lens looks *at* the village, then travels to forest and sky.
    This is a journey, not a six-point orbit of one look-at.
    """
    cx = (min_x + max_x) * 0.5
    cy = (min_y + max_y) * 0.5
    rx = max((max_x - min_x) * 0.5, 4.0)
    ry = max((max_y - min_y) * 0.5, 4.0)
    safe = village_orbit_radius(rx, ry)
    look_z = min_z + min(max(vert * 0.38, 2.4), 5.5)
    sky_z = min_z + min(max(vert * 1.25, 16.0), 30.0)
    fx = cx if forest_x is None else float(forest_x)
    fy = cy + max(ry * 1.7, 20.0) if forest_y is None else float(forest_y)
    fz = min_z + min(max(vert * 0.7, 4.0), 9.0) if forest_z is None else float(forest_z)

    # Angles are from village center: 0=+X, 90=+Y. Radii are * safe outside orbit.
    beats = (
        # Wide establishing: far SW, high, lots of portrait sky.
        {'angle': 210.0, 'r': 1.90, 'h': 24.0, 'look': (cx, cy, look_z), 'lens': 26.0},
        # Street approach: closer, lower, still outside.
        {'angle': 192.0, 'r': 1.30, 'h': 11.5, 'look': (cx + rx * 0.10, cy + ry * 0.12, look_z), 'lens': 32.0},
        # Among cabins: south edge looking through the street.
        {'angle': 174.0, 'r': 1.10, 'h': 7.0, 'look': (cx + rx * 0.16, cy + ry * 0.38, look_z * 0.90), 'lens': 38.0},
        # Forest edge: SE, look past cabins toward the forest cluster.
        {'angle': 138.0, 'r': 1.20, 'h': 8.8, 'look': (fx, (cy + fy) * 0.5, (look_z + fz) * 0.5), 'lens': 34.0},
        # Through trees: nearer the forest, still outside the village AABB.
        {'angle': 78.0, 'r': 1.42, 'h': 9.2, 'look': (fx, fy, fz), 'lens': 32.0},
        # Crane-up sky ending: pull back and up; look rises into the HDRI.
        {'angle': 248.0, 'r': 2.05, 'h': 30.0, 'look': (cx, cy + ry * 0.35, sky_z), 'lens': 24.0},
    )

    keys: list[dict] = []
    for beat in beats:
        ang = math.radians(beat['angle'])
        radius = safe * beat['r']
        x = cx + math.cos(ang) * radius
        y = cy + math.sin(ang) * radius
        x, y = point_outside_aabb(x, y, min_x, min_y, max_x, max_y, pad=6.0)
        keys.append({
            'camera': (float(x), float(y), float(min_z + beat['h'])),
            'look': tuple(float(v) for v in beat['look']),
            'lens': float(beat['lens']),
        })
    return keys


def village_file_rank(name: str) -> tuple:
    n = str(name or '').lower()
    cabin_a = 0 if is_cabin_a_name(n) else 1
    cabin_b = 1 if re.search(r'cabin\d+b\b', n) else 0
    dressing = 0 if any(word in n for word in ('tree', 'fence', 'gate', 'cart')) else 1
    outdoor = 0 if is_village_outdoor_name(n) else 1
    interior = 1 if is_village_interior_name(n) else 0
    return (cabin_a, cabin_b, dressing, outdoor, interior)


def is_dump_name(name: str) -> bool:
    n = str(name or '').lower().replace('\\', '/')
    return any(marker in n for marker in DUMP_MARKERS)


def is_staging_name(name: str) -> bool:
    n = str(name or '').lower().replace('\\', '/')
    return any(marker in n for marker in STAGING_MARKERS)


def cinematic_world_camera_keys(
    village_min_x: float,
    village_min_y: float,
    village_max_x: float,
    village_max_y: float,
    village_min_z: float,
    village_vert: float,
    forest_x: float | None = None,
    forest_y: float | None = None,
    forest_z: float | None = None,
    mountain_x: float | None = None,
    mountain_y: float | None = None,
    mountain_z: float | None = None,
) -> list[dict]:
    """Mountains/sky establish → forest/river → village reveal.

    Camera XY stays outside the village AABB. This is a valley journey, not a
    product orbit of the cabin cluster.
    """
    vx = (village_min_x + village_max_x) * 0.5
    vy = (village_min_y + village_max_y) * 0.5
    look_z = village_min_z + min(max(village_vert * 0.36, 2.2), 5.0)
    fx = vx if forest_x is None else float(forest_x)
    fy = vy + 36.0 if forest_y is None else float(forest_y)
    fz = village_min_z + 5.0 if forest_z is None else float(forest_z)
    mx = vx if mountain_x is None else float(mountain_x)
    my = fy + 48.0 if mountain_y is None else float(mountain_y)
    mz = village_min_z + 18.0 if mountain_z is None else float(mountain_z)

    # 9:16 stacks layers vertically. Stay far south and keep every look
    # aimed up-valley so river / village / forest / mountains / sky share the frame.
    beats = (
        # Wide establish: far south, high. Look past the village to the peaks.
        {'camera': (vx + 10.0, vy - 56.0, village_min_z + 28.0), 'look': (mx, my, mz), 'lens': 24.0},
        # Descend toward the forest and river corridor, still a valley shot.
        {'camera': (vx + 12.0, vy - 46.0, village_min_z + 20.0), 'look': (fx, (fy + my) * 0.5, (fz + mz) * 0.45), 'lens': 26.0},
        # Travel along the river; village and mountains stay in the same 9:16 frame.
        {'camera': (vx + 8.0, vy - 42.0, village_min_z + 17.0), 'look': (vx, vy + 28.0, look_z + 5.0), 'lens': 26.0},
        # Cross the river toward the village street, never a cabin portrait.
        {'camera': (vx + 10.0, vy - 40.0, village_min_z + 16.0), 'look': (vx, vy + 22.0, look_z + 4.0), 'lens': 27.0},
        # Village becomes the destination; forest and peaks remain stacked.
        {'camera': (vx + 10.0, vy - 42.0, village_min_z + 15.0), 'look': (vx, vy + 18.0, look_z + 3.0), 'lens': 28.0},
        # Composed village hero with the valley layers still readable.
        {'camera': (vx + 12.0, vy - 44.0, village_min_z + 16.0), 'look': (vx, vy + 20.0, look_z + 3.5), 'lens': 27.0},
    )
    keys: list[dict] = []
    for beat in beats:
        x, y, z = beat['camera']
        x, y = point_outside_aabb(x, y, village_min_x, village_min_y, village_max_x, village_max_y, pad=6.0)
        keys.append({
            'camera': (float(x), float(y), float(z)),
            'look': tuple(float(v) for v in beat['look']),
            'lens': float(beat['lens']),
        })
    return keys


def extract_role_limit(role: str) -> int:
    if role == 'sky_hdri':
        return 12
    if role == 'village_textures':
        # Cabin01_ALB is 4.6 MiB and was previously dropped for Grass01 cards.
        return 40
    if role in {'forest_nature', 'forest_ecokit'}:
        return 24
    if role in {'village_fbx', 'village_blender'}:
        # Village (Blender 4.2.2).zip has 33 kit .blends. The previous 28-file
        # cap dropped the five largest Cabin*A buildings.
        return 40
    if role == 'background_mountains':
        # Louis pack is three huge .blends. Extract only the grassy hero.
        return 2
    if role == 'village_project':
        return 4
    if role in {'sky_machine_v1', 'sky_machine_v2', 'sky_extra_update', 'world_shaders'}:
        return 12
    return 24


def geometry_file_limit(role: str) -> int:
    # Village zip is a kit of individual cabin/tree/fence files, not one scene.
    # Import several Cabin*A buildings so the camera has a real village cluster.
    if role == 'village_blender':
        # Four Cabin*A plus trees, cart, gate, and fence so the path is dressed.
        return 10
    if role == 'village_fbx':
        return 6
    if role == 'village_project':
        return 1
    if role == 'forest_nature':
        # Combined kit dump. One FBX is enough; a second pick was the same OBJ dump.
        return 1
    if role == 'forest_ecokit':
        return 3
    if role == 'background_mountains':
        return 1
    return 1


def should_extract_member(filename: str, file_size: int, role: str) -> bool:
    ext = Path(str(filename)).suffix.lower()
    if ext not in SUPPORT_EXTS:
        return False
    size = int(file_size or 0)
    cap = MAX_EXTRACT_BYTES.get(ext)
    if role == 'background_mountains' and ext == '.blend':
        cap = 600 * 1024 * 1024
    if cap is not None and size > cap:
        # Last-resort: still extract one modest dump OBJ if it is the only geometry.
        if ext == '.obj' and is_dump_name(filename) and size <= 80 * 1024 * 1024:
            return role in {'forest_nature', 'forest_ecokit'}
        return False
    return True


def extract_sort_key(filename: str, file_size: int, role: str = '') -> tuple:
    path = Path(str(filename).replace('\\', '/'))
    ext = path.suffix.lower()
    name = path.name.lower()
    geo = 0 if ext in GEOMETRY_EXTS else 1
    hdri = 0 if ext in {'.hdr', '.exr', '.jpg', '.jpeg'} else 1
    dump = 1 if is_dump_name(name) else 0
    staging = 1 if is_staging_name(name) else 0
    albedo_miss = 0 if (ext not in IMAGE_EXTS or any(w in name for w in ALBEDO_WORDS + GROUND_WORDS)) else 1
    ext_rank = EXT_RANK.get(ext, 8)
    if role == 'sky_hdri':
        # Largest HDR was a dusk/gray-bottom map. Prefer a named daylight sk2 plate.
        daylight_miss = 0 if ('sk2' in name and '0001' in name) else 1
        dusk = 1 if any(word in name for word in ('sk4', 'sunset', 'dusk', 'night')) else 0
        return (geo, dump, staging, daylight_miss, dusk, hdri, int(file_size or 0), name)
    if role == 'village_textures':
        non_alb = 1 if any(word in name for word in NON_ALBEDO_WORDS) else 0
        grass_card = 1 if any(word in name for word in ('grass01', 'cutout', 'mask')) else 0
        cabin_alb_miss = 0 if ('cabin' in name and any(word in name for word in ('_alb', 'alb.'))) else 1
        straw_miss = 0 if ('straw' in name and any(word in name for word in ('_alb', 'alb.'))) else 1
        wood_miss = 0 if (any(word in name for word in ('wood', 'trunk', 'leaf')) and any(w in name for w in ('_alb', 'alb.'))) else 1
        colored_miss = 0 if 'colored' in name else 1
        return (geo, dump, staging, non_alb, grass_card, cabin_alb_miss, straw_miss, wood_miss, colored_miss, -int(file_size or 0), name)
    if role == 'forest_ecokit':
        water_miss = 0 if 'water' in name and ext == '.blend' else 1
        return (geo, dump, staging, water_miss, ext_rank, hdri, albedo_miss, int(file_size or 0), name)
    if role == 'background_mountains':
        snowy = 1 if 'snow' in name else 0
        grassy_miss = 0 if any(word in name for word in ('grass', 'meadow')) else 1
        return (geo, dump, staging, snowy, grassy_miss, ext_rank, -int(file_size or 0), name)
    if str(role).startswith('village') and ext in GEOMETRY_EXTS:
        # Prefer Cabin*A, then trees/fence, never interior props or Cabin*B fillers.
        return (geo, dump, staging, *village_file_rank(name), ext_rank, -int(file_size or 0), name)
    # Prefer smaller geometry so individual trees/houses win over combined dumps.
    return (geo, dump, staging, ext_rank, hdri, albedo_miss, int(file_size or 0), name)


def mesh_keep_rank(name: str, role: str, face_count: int = 0, dimensions: tuple | None = None) -> tuple:
    n = str(name or '').lower()
    words = HERO_WORDS.get(role, ())
    staging = 1 if is_staging_name(n) else 0
    water = 1 if is_water_or_ocean_name(n) else 0
    foliage = 1 if is_foliage_card_name(n) else 0
    high_lod = 1 if is_high_lod_name(n) else 0
    primitive = 1 if is_primitive_name(n) or is_box_mesh(face_count, dimensions) or is_dominating_plane(face_count, dimensions) else 0
    flat = 0
    if dimensions and len(dimensions) >= 3:
        mx = max(dimensions)
        mn = min(dimensions)
        if mx > 3 and mn < 0.22 * max(mx, 0.001):
            flat = 1
    hero_miss = 0 if (not words or any(w in n for w in words)) else 1
    return (staging, water, foliage, high_lod, primitive, flat, hero_miss, -int(face_count or 0), n)


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
        if role in {'village_blender', 'village_fbx'}:
            return (dump, staging, *village_file_rank(name), word_miss, -size, name)
        if str(role).startswith('village'):
            water = 1 if is_water_or_ocean_name(name) else 0
            blend_miss = 0 if ext == '.blend' else 1
            scene_miss = 0 if any(token in name for token in ('village', 'scene', 'full', 'project')) else 1
            return (dump, staging, water, blend_miss, scene_miss, word_miss, -size, name)
        if role == 'background_mountains':
            snowy = 1 if 'snow' in name else 0
            grassy_miss = 0 if any(word in name for word in ('grass', 'meadow', 'mountain', 'range')) else 1
            return (dump, staging, snowy, grassy_miss, word_miss, -size, name)
        return (dump, staging, word_miss, EXT_RANK.get(ext, 9), size, name)

    geo.sort(key=rank)
    preferred = [r for r in geo if not is_dump_name(str(r.get('name') or '')) and not is_staging_name(str(r.get('name') or ''))]
    if role in {'village_blender', 'village_fbx'}:
        outdoor = [
            r for r in preferred
            if is_village_outdoor_name(str(r.get('name') or ''))
            and not is_village_interior_name(str(r.get('name') or ''))
        ]
        if outdoor:
            preferred = mix_village_kit_records(outdoor, limit)
    chosen = (preferred or [r for r in geo if not is_dump_name(str(r.get('name') or ''))] or geo)[: max(1, int(limit))]
    return chosen


def mix_village_kit_records(records: list[dict], limit: int) -> list[dict]:
    """5 cabins + trees + fence/gate so the cluster is a village, not 8 stacked houses."""
    def name_of(rec: dict) -> str:
        return str(rec.get('name') or '').lower()

    cabins_a = [r for r in records if is_cabin_a_name(name_of(r))]
    cabins = [
        r for r in records
        if any(word in name_of(r) for word in ('cabin', 'house', 'building', 'village'))
        and r not in cabins_a
    ]
    trees = [r for r in records if 'tree' in name_of(r)]
    props = [r for r in records if any(word in name_of(r) for word in ('fence', 'gate', 'cart'))]
    chosen: list[dict] = []

    def take(pool: list[dict], count: int) -> None:
        for rec in pool:
            if rec not in chosen and len(chosen) < max(1, int(limit)) and count > 0:
                chosen.append(rec)
                count -= 1

    take(cabins_a, 4)
    take(cabins, max(0, 4 - len(chosen)))
    take(trees, 3)
    take(props, 3)
    take(cabins_a + trees + props, max(1, int(limit)))
    take(cabins, max(1, int(limit)))
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


def pick_daylight_sky_path(paths: list[Path]) -> Path | None:
    images = [p for p in paths if getattr(p, 'is_file', lambda: False)() and p.suffix.lower() in IMAGE_EXTS]

    def rank(path: Path) -> tuple:
        name = str(path).lower()
        daylight_miss = 0 if ('sk2' in name and '0001' in name) else 1
        dusk = 1 if any(word in name for word in ('sk4', 'sunset', 'dusk', 'night')) else 0
        how_to = 1 if 'how to use' in name or 'howto' in name else 0
        return (how_to, daylight_miss, dusk, -min(path.stat().st_size, 72 * 1024 * 1024), name)

    images.sort(key=rank)
    return images[0] if images else None


def pick_cabin_albedo_path(paths: list[Path]) -> Path | None:
    images = [
        p for p in paths
        if getattr(p, 'is_file', lambda: False)()
        and p.suffix.lower() in IMAGE_EXTS
        and 'cabin' in p.name.lower()
        and any(word in p.name.lower() for word in ('_alb', 'alb.'))
        and not is_grass_card_texture_name(p.name)
    ]

    def rank(path: Path) -> tuple:
        name = str(path).lower()
        colored_miss = 0 if 'colored' in name else 1
        return (colored_miss, -min(path.stat().st_size, 8 * 1024 * 1024), name)

    images.sort(key=rank)
    return images[0] if images else None


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

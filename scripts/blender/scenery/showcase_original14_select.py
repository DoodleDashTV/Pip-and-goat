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


def extract_role_limit(role: str) -> int:
    if role == 'sky_hdri':
        return 8
    if role == 'village_textures':
        return 40
    if role in {'forest_nature', 'forest_ecokit', 'village_fbx', 'village_blender', 'village_project'}:
        return 48
    if role in {'sky_machine_v1', 'sky_machine_v2', 'sky_extra_update', 'world_shaders'}:
        return 16
    return 32


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
    ext_rank = EXT_RANK.get(ext, 8)
    # Prefer smaller geometry so individual trees/houses win over combined dumps.
    return (geo, dump, ext_rank, hdri, int(file_size or 0), name)


def pick_geometry_records(records: list[dict], role: str, limit: int = 1) -> list[dict]:
    words = HERO_WORDS.get(role, ())
    geo = [r for r in records if str(r.get('ext') or '').lower() in GEOMETRY_EXTS]

    def rank(rec: dict) -> tuple:
        name = str(rec.get('name') or '').lower()
        ext = str(rec.get('ext') or '').lower()
        size = int(rec.get('size') or 0)
        word_miss = 0 if (not words or any(w in name for w in words)) else 1
        return (1 if is_dump_name(name) else 0, word_miss, EXT_RANK.get(ext, 9), size, name)

    geo.sort(key=rank)
    preferred = [r for r in geo if not is_dump_name(str(r.get('name') or ''))]
    chosen = (preferred or geo)[: max(1, int(limit))]
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

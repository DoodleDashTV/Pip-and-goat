"""Resolve EcoKit image datablock paths to extracted purchased pixels.

No Blender. No generic fallback textures. Flora/Rock .blend files store
vendor-relative and vendor-absolute paths that only resolve after the
sibling Textures/ and assets library/ trees are on disk next to the
libraries.
"""
from __future__ import annotations

from pathlib import Path

ECOKIT_PREFIX = "Stylised EcoKit"
TEXTURES_DIR = "Textures"
ASSETS_LIBRARY_DIR = "assets library"
REQUIRED_TEXTURE_PREFIXES = (
    f"{ECOKIT_PREFIX}/{TEXTURES_DIR}/",
    f"{ECOKIT_PREFIX}/{ASSETS_LIBRARY_DIR}/",
)
DOCUMENTED_TEXTURE_COUNT = 1134
DOCUMENTED_TEXTURES_DIR_COUNT = 27
DOCUMENTED_ASSETS_LIBRARY_COUNT = 1107

# Exact basenames recovered from Flora_Mat&GN&Models.blend and
# Rock_Models.blend string tables. Each exists in the purchased zip.
FLORA_BLEND_IMAGE_NAMES = (
    "Tree Trunk_1.png",
    "Tree Trunk_2.png",
    "Tree Trunk_3.png",
    "03-2.png",
    "Flora_1.png",
    "Moss_2.png",
    "firefly_1.png",
    "firefly_2.png",
    "Grass_3_020.png",
)
ROCK_BLEND_IMAGE_NAMES = (
    "01-8.png",
    "Tree Trunk_1.png",
    "Rock_Model_Large_010.png",
)
REQUIRED_IMAGE_NAMES = tuple(dict.fromkeys(FLORA_BLEND_IMAGE_NAMES + ROCK_BLEND_IMAGE_NAMES))

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tga", ".tif", ".tiff", ".exr", ".hdr"}


def _norm(path: str) -> str:
    return str(path or "").replace("\\", "/").strip()


def basename(path: str) -> str:
    return Path(_norm(path)).name


def is_required_ecokit_texture(filename: str) -> bool:
    rel = _norm(filename)
    if rel.startswith("./"):
        rel = rel[2:]
    return any(rel.startswith(prefix) for prefix in REQUIRED_TEXTURE_PREFIXES)


def is_image_name(name: str) -> bool:
    return Path(name).suffix.lower() in IMAGE_EXTS


def index_ecokit_images(root: Path) -> dict[str, Path]:
    """Map lowercase basename -> first existing extracted EcoKit image."""
    index: dict[str, Path] = {}
    folders = [
        _first_named_dir(root, TEXTURES_DIR),
        _first_named_dir(root, ASSETS_LIBRARY_DIR),
    ]
    for folder in folders:
        if folder is None:
            continue
        for path in folder.rglob("*"):
            if path.is_file() and is_image_name(path.name):
                index.setdefault(path.name.lower(), path)
    return index


def _first_named_dir(root: Path, name: str) -> Path | None:
    direct = Path(root) / ECOKIT_PREFIX / name
    if direct.is_dir():
        return direct
    matches = [
        path for path in Path(root).rglob(name)
        if path.is_dir() and path.name == name and ECOKIT_PREFIX in path.as_posix()
    ]
    return matches[0] if matches else None


def count_ecokit_images(root: Path) -> dict[str, int]:
    textures = _first_named_dir(root, TEXTURES_DIR)
    assets = _first_named_dir(root, ASSETS_LIBRARY_DIR)
    tex_n = len([p for p in textures.glob("*") if p.is_file() and is_image_name(p.name)]) if textures is not None else 0
    asset_n = len([p for p in assets.glob("*") if p.is_file() and is_image_name(p.name)]) if assets is not None else 0
    return {
        "texturesDir": tex_n,
        "assetsLibrary": asset_n,
        "total": tex_n + asset_n,
        "texturesDirExists": textures is not None,
        "assetsLibraryExists": assets is not None,
        "texturesDirPath": str(textures) if textures is not None else None,
        "assetsLibraryPath": str(assets) if assets is not None else None,
    }


def candidate_paths(filepath: str, blend_dir: Path | None, extract_root: Path) -> list[Path]:
    """Ordered purchased-pixel candidates for one Blender image filepath."""
    raw = _norm(filepath)
    name = basename(raw)
    out: list[Path] = []
    if not name:
        return out
    if blend_dir is not None:
        out.append(Path(blend_dir) / TEXTURES_DIR / name)
        out.append(Path(blend_dir) / TEXTURES_DIR.lower() / name)
        out.append(Path(blend_dir) / ASSETS_LIBRARY_DIR / name)
        out.append(Path(blend_dir).parent / TEXTURES_DIR / name)
    root = Path(extract_root)
    out.append(root / ECOKIT_PREFIX / TEXTURES_DIR / name)
    out.append(root / ECOKIT_PREFIX / ASSETS_LIBRARY_DIR / name)
    rel = raw
    if rel.startswith("//"):
        rel = rel[2:]
    if rel and not Path(rel).is_absolute():
        if blend_dir is not None:
            out.append(Path(blend_dir) / rel)
        out.append(root / rel)
        out.append(root / ECOKIT_PREFIX / Path(rel).name)
    return out


def resolve_ecokit_image(filepath: str, extract_root: Path, blend_dir: Path | None = None, index: dict[str, Path] | None = None) -> Path | None:
    seen: set[str] = set()
    for cand in candidate_paths(filepath, blend_dir, extract_root):
        key = str(cand)
        if key in seen:
            continue
        seen.add(key)
        if cand.is_file() and cand.stat().st_size > 64:
            return cand
    if index is None:
        index = index_ecokit_images(extract_root)
    found = index.get(basename(filepath).lower())
    if found is not None and found.is_file() and found.stat().st_size > 64:
        return found
    return None


def missing_required_images(extract_root: Path) -> list[str]:
    index = index_ecokit_images(extract_root)
    return [name for name in REQUIRED_IMAGE_NAMES if name.lower() not in index]


def verify_ecokit_texture_tree(extract_root: Path) -> dict:
    counts = count_ecokit_images(extract_root)
    missing_named = missing_required_images(extract_root)
    blockers = []
    if not counts["texturesDirExists"]:
        blockers.append("MISSING_TEXTURES_DIR")
    if not counts["assetsLibraryExists"]:
        blockers.append("MISSING_ASSETS_LIBRARY_DIR")
    if counts["texturesDir"] != DOCUMENTED_TEXTURES_DIR_COUNT:
        blockers.append(f"TEXTURES_DIR_COUNT:{counts['texturesDir']}")
    if counts["assetsLibrary"] != DOCUMENTED_ASSETS_LIBRARY_COUNT:
        blockers.append(f"ASSETS_LIBRARY_COUNT:{counts['assetsLibrary']}")
    if counts["total"] != DOCUMENTED_TEXTURE_COUNT:
        blockers.append(f"TEXTURE_TOTAL:{counts['total']}")
    if missing_named:
        blockers.append("MISSING_NAMED:" + ",".join(missing_named))
    return {
        "schema": "TIVVLEJOY_ECOKIT_TEXTURE_TREE_V1",
        "counts": counts,
        "requiredImageNames": list(REQUIRED_IMAGE_NAMES),
        "missingNamed": missing_named,
        "blockers": blockers,
        "ok": not blockers,
    }

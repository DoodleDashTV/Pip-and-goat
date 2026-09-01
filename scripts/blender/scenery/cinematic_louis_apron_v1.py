"""Non-destructive Louis apron clip. Do not delete the visible south face.

V5 `clip_louis_world_apron` deleted every vertex south of a world Y cut.
That punched holes through the grassy slope and revealed the HDRI as white
wedges. The unused apron is the *low-Z* south skirt, not the whole south half.
"""
from __future__ import annotations


def should_remove_apron_vert(
    world_y: float,
    world_z: float,
    *,
    south_y: float,
    z_cut: float,
) -> bool:
    """True only for the unused base: south of the valley cut AND below z_cut."""
    return world_y < south_y and world_z < z_cut


def apron_z_cut(z_min: float, z_max: float, frac: float = 0.16) -> float:
    """Keep the lower `frac` of height as candidate apron, not the face."""
    span = max(0.01, z_max - z_min)
    return z_min + span * max(0.06, min(0.28, frac))


def clip_stats(world_coords: list[tuple[float, float, float]], south_y: float, z_frac: float = 0.16) -> dict:
    if not world_coords:
        return {"removed": 0, "kept": 0, "southY": south_y, "zCut": 0.0}
    zs = [c[2] for c in world_coords]
    z_cut = apron_z_cut(min(zs), max(zs), z_frac)
    removed = sum(1 for _x, y, z in world_coords if should_remove_apron_vert(y, z, south_y=south_y, z_cut=z_cut))
    return {
        "removed": removed,
        "kept": len(world_coords) - removed,
        "southY": south_y,
        "zCut": z_cut,
        "conservative": True,
        "oldSouthOnlyWouldRemove": sum(1 for _x, y, _z in world_coords if y < south_y),
    }

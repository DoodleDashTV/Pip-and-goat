#!/usr/bin/env python3
from cinematic_louis_apron_v1 import apron_z_cut, clip_stats, should_remove_apron_vert


def test_visible_south_face_is_kept():
    # South of the Y cut but high on the slope — this is the grassy face.
    assert should_remove_apron_vert(10.0, 8.0, south_y=15.0, z_cut=2.0) is False
    # South and low — unused apron / world skirt.
    assert should_remove_apron_vert(10.0, 0.4, south_y=15.0, z_cut=2.0) is True
    # North base stays; do not carve the backside into a hole.
    assert should_remove_apron_vert(22.0, 0.4, south_y=15.0, z_cut=2.0) is False


def test_conservative_removes_fewer_than_south_only():
    coords = [
        (0.0, 8.0, 9.0),   # south face
        (0.0, 8.0, 0.3),   # south apron
        (0.0, 20.0, 0.3),  # north base
        (0.0, 20.0, 12.0), # peak
    ]
    stats = clip_stats(coords, south_y=15.0, z_frac=0.16)
    assert stats["removed"] == 1
    assert stats["oldSouthOnlyWouldRemove"] == 2
    assert apron_z_cut(0.0, 10.0, 0.16) == 1.6


if __name__ == "__main__":
    test_visible_south_face_is_kept()
    test_conservative_removes_fewer_than_south_only()
    print("cinematic_louis_apron_v1_test PASS")

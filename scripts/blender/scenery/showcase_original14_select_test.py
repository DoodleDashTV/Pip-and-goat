#!/usr/bin/env python3
"""Zero-cost ranking tests for the Original-14 scenery speed repair."""
from __future__ import annotations

import math
from pathlib import Path

from showcase_original14_select import (
    cinematic_camera_keys,
    cinematic_world_camera_keys,
    extract_role_limit,
    extract_sort_key,
    geometry_file_limit,
    is_bank_flora_name,
    is_box_mesh,
    is_camera_hero_name,
    is_dominating_plane,
    is_dump_name,
    is_foliage_card_name,
    is_forest_camera_subject_name,
    is_grass_card_texture_name,
    is_high_lod_name,
    is_primitive_name,
    is_staging_name,
    is_village_camera_subject_name,
    is_water_or_ocean_name,
    is_authored_village_mesh_name,
    is_cabin_texture_name,
    mesh_keep_rank,
    point_outside_aabb,
    village_orbit_radius,
    pick_cabin_albedo_path,
    pick_daylight_sky_path,
    pick_geometry_records,
    pick_ground_image_records,
    should_extract_member,
)


def test_dump_name_detects_combined_forest_kit():
    assert is_dump_name('Stylized_Forest_Nature_Kit.obj') is True
    assert is_dump_name('Pine_Tree_01.fbx') is False


def test_extract_skips_huge_obj_and_keeps_individual_assets():
    assert should_extract_member('Pine_Tree_01.fbx', 3 * 1024 * 1024, 'forest_nature') is True
    assert should_extract_member('house_a.blend', 40 * 1024 * 1024, 'village_blender') is True
    assert should_extract_member('huge_dump.obj', 90 * 1024 * 1024, 'forest_nature') is False
    # Production still skips the purchased originals that exceed 180 MiB.
    assert should_extract_member('Stylized_Forest_Nature_Kit.blend', 494 * 1024 * 1024, 'forest_nature') is False
    assert should_extract_member('Flora_Mat&GN&Models.blend', 670 * 1024 * 1024, 'forest_ecokit') is False
    assert should_extract_member('Rock_Models.blend', 258 * 1024 * 1024, 'forest_ecokit') is False
    assert should_extract_member('sk2/0001.hdr', 67 * 1024 * 1024, 'sky_hdri') is False


def test_lookdev_intake_allows_verified_large_originals():
    assert should_extract_member(
        'Stylized_Forest_Nature_Kit.blend', 494 * 1024 * 1024, 'forest_nature', intake='lookdev',
    ) is True
    assert should_extract_member(
        'Flora_Mat&GN&Models.blend', 670 * 1024 * 1024, 'forest_ecokit', intake='lookdev',
    ) is True
    assert should_extract_member(
        'Rock_Models.blend', 258 * 1024 * 1024, 'forest_ecokit', intake='lookdev',
    ) is True
    assert should_extract_member(
        'HDRi_JPG_Pack/sk2/0001.hdr', 67 * 1024 * 1024, 'sky_hdri', intake='lookdev',
    ) is True
    # Lookdev still refuses combined OBJ dumps and unknown huge blends.
    assert should_extract_member(
        'Stylized_Forest_Nature_Kit.obj', 90 * 1024 * 1024, 'forest_nature', intake='lookdev',
    ) is False
    assert should_extract_member(
        'unknown_kit.blend', 400 * 1024 * 1024, 'forest_nature', intake='lookdev',
    ) is False
    assert should_extract_member(
        'bq_Tree_Salix-babylonica_C_summer.blend', 26 * 1024 * 1024, 'botaniq_full', intake='lookdev',
    ) is True
    assert should_extract_member(
        '3DT_Pack_Mountains.blend', 1415 * 1024 * 1024, 'mountains_3dt', intake='lookdev',
    ) is True


def test_geometry_picker_prefers_small_blend_over_combined_obj():
    records = [
        {'name': 'Stylized_Forest_Nature_Kit.obj', 'ext': '.obj', 'size': 9_000_000},
        {'name': 'Pine_Tree_01.fbx', 'ext': '.fbx', 'size': 2_000_000},
        {'name': 'Cabin_Hero.blend', 'ext': '.blend', 'size': 8_000_000},
    ]
    chosen = pick_geometry_records(records, 'forest_nature', limit=1)
    assert [c['name'] for c in chosen] == ['Pine_Tree_01.fbx']
    village = pick_geometry_records(records, 'village_blender', limit=1)
    assert village[0]['name'] == 'Cabin_Hero.blend'


def test_fallback_to_dump_when_it_is_the_only_geometry():
    records = [{'name': 'Stylized_Forest_Nature_Kit.obj', 'ext': '.obj', 'size': 9_000_000}]
    chosen = pick_geometry_records(records, 'forest_nature', limit=1)
    assert chosen[0]['name'] == 'Stylized_Forest_Nature_Kit.obj'


def test_extract_sort_puts_individual_blend_before_dump_obj():
    keys = [
        ('Stylized_Forest_Nature_Kit.obj', 9_000_000),
        ('Pine_Tree_01.fbx', 2_000_000),
        ('sky_preview.jpg', 1_500_000),
    ]
    ordered = sorted(keys, key=lambda item: extract_sort_key(item[0], item[1]))
    assert ordered[0][0] == 'Pine_Tree_01.fbx'


def test_hdri_extract_limit_is_small():
    assert extract_role_limit('sky_hdri') == 12
    assert extract_role_limit('village_textures') == 40
    assert extract_role_limit('forest_nature') == 24


def test_extracts_mtl_sidecar_for_obj_materials():
    assert should_extract_member('Pine_Tree_01.mtl', 1200, 'forest_nature') is True


def test_staging_names_are_rejected():
    assert is_staging_name('Staging_Platform_01') is True
    assert is_staging_name('UCX_HouseCollider') is True
    assert is_staging_name('Pine_Tree_01') is False


def test_geometry_file_limits_allow_density_without_dump():
    assert geometry_file_limit('forest_nature') == 1
    assert geometry_file_limit('forest_ecokit') == 3
    assert geometry_file_limit('background_mountains') == 1
    assert geometry_file_limit('village_blender') == 10
    assert geometry_file_limit('village_fbx') == 6
    assert extract_role_limit('village_blender') == 40
    assert extract_role_limit('village_fbx') == 40


def test_geometry_picker_skips_staging_when_heroes_exist():
    records = [
        {'name': 'Staging_Platform.fbx', 'ext': '.fbx', 'size': 1_000_000},
        {'name': 'Cabin_Hero.blend', 'ext': '.blend', 'size': 8_000_000},
    ]
    chosen = pick_geometry_records(records, 'village_blender', limit=1)
    assert chosen[0]['name'] == 'Cabin_Hero.blend'


def test_mesh_keep_rank_prefers_hero_over_flat_platform():
    hero = mesh_keep_rank('Pine_Tree_01', 'forest_nature', 4000, (3, 3, 8))
    slab = mesh_keep_rank('Staging_Platform', 'forest_nature', 20000, (40, 40, 0.2))
    assert hero < slab
    mid = mesh_keep_rank('DebugPlane', 'village_blender', 800, (6, 6, 0.1))
    cabin = mesh_keep_rank('Cabin_Hero', 'village_blender', 800, (4, 3, 3))
    assert cabin < mid


def test_ground_picker_prefers_grass_over_random_huge_atlas():
    records = [
        {'name': 'Atlas_Pack.png', 'ext': '.png', 'size': 12_000_000},
        {'name': 'Village_Grass_Albedo.jpg', 'ext': '.jpg', 'size': 2_000_000},
    ]
    chosen = pick_ground_image_records(records)
    assert chosen['name'] == 'Village_Grass_Albedo.jpg'


def test_ground_picker_skips_normal_maps():
    records = [
        {'name': 'Ground_Normal.png', 'ext': '.png', 'size': 4_000_000},
        {'name': 'Forest_Dirt_Diffuse.jpg', 'ext': '.jpg', 'size': 1_500_000},
    ]
    chosen = pick_ground_image_records(records)
    assert chosen['name'] == 'Forest_Dirt_Diffuse.jpg'


def test_ground_picker_skips_high_contrast_leaf_tiles():
    records = [
        {'name': 'Leaf_Pattern_Albedo.png', 'ext': '.png', 'size': 5_000_000},
        {'name': 'Village_Grass_Albedo.jpg', 'ext': '.jpg', 'size': 2_000_000},
    ]
    chosen = pick_ground_image_records(records)
    assert chosen['name'] == 'Village_Grass_Albedo.jpg'


def test_village_picker_prefers_authored_blend_over_tiny_fbx():
    records = [
        {'name': 'Fence_Post.fbx', 'ext': '.fbx', 'size': 80_000},
        {'name': 'Village.blend', 'ext': '.blend', 'size': 6_000_000},
        {'name': 'Cart.fbx', 'ext': '.fbx', 'size': 120_000},
    ]
    chosen = pick_geometry_records(records, 'village_blender', limit=1)
    assert chosen[0]['name'] == 'Village.blend'


def test_dominating_plane_is_rejected_for_camera_bounds():
    assert is_dominating_plane(8, (400.0, 400.0, 0.2)) is True
    assert is_dominating_plane(8, (16.0, 16.0, 0.15)) is True
    assert is_dominating_plane(4000, (3.0, 3.0, 8.0)) is False
    hero = mesh_keep_rank('Cabin_Hero', 'village_blender', 1800, (4, 3, 3))
    water = mesh_keep_rank('Ocean', 'village_blender', 8, (400, 400, 0.2))
    assert hero < water


def test_primitive_boxes_rank_behind_hero_meshes():
    assert is_primitive_name('Cube') is True
    assert is_primitive_name('Cube.001') is True
    assert is_primitive_name('Cabin_Hero') is False
    assert is_box_mesh(6, (2.0, 2.0, 2.0)) is True
    assert is_box_mesh(4000, (3.0, 3.0, 8.0)) is False
    hero = mesh_keep_rank('Cabin_Hero', 'village_blender', 1800, (4, 3, 3))
    cube = mesh_keep_rank('Cube', 'village_blender', 6, (2, 2, 2))
    assert hero < cube


def test_village_picker_prefers_cabin_a_over_interior_and_skips_none():
    records = [
        {'name': 'Book01.blend', 'ext': '.blend', 'size': 1_266_472},
        {'name': 'Cabin04B.blend', 'ext': '.blend', 'size': 1_598_369},
        {'name': 'Cabin04A.blend', 'ext': '.blend', 'size': 2_262_865},
        {'name': 'Grass01.blend', 'ext': '.blend', 'size': 1_252_184},
        {'name': 'Tree02.blend', 'ext': '.blend', 'size': 1_390_580},
        {'name': 'Cabin01A.blend', 'ext': '.blend', 'size': 1_806_509},
        {'name': 'Fence01.blend', 'ext': '.blend', 'size': 1_271_868},
        {'name': 'Chair01.blend', 'ext': '.blend', 'size': 1_261_232},
        {'name': 'Cabin02A.blend', 'ext': '.blend', 'size': 1_861_389},
    ]
    chosen = pick_geometry_records(records, 'village_blender', limit=8)
    names = [c['name'] for c in chosen]
    assert names[0] == 'Cabin04A.blend'
    assert 'Cabin01A.blend' in names
    assert 'Cabin02A.blend' in names
    assert 'Tree02.blend' in names
    assert 'Fence01.blend' in names
    assert 'Book01.blend' not in names
    assert 'Chair01.blend' not in names
    assert 'Grass01.blend' not in names


def test_village_mix_prefers_trees_and_fence_over_cabin_b():
    records = [
        {'name': 'Cabin04A.blend', 'ext': '.blend', 'size': 2_262_865},
        {'name': 'Cabin03A.blend', 'ext': '.blend', 'size': 2_100_000},
        {'name': 'Cabin02A.blend', 'ext': '.blend', 'size': 1_861_389},
        {'name': 'Cabin01A.blend', 'ext': '.blend', 'size': 1_806_509},
        {'name': 'Cabin04B.blend', 'ext': '.blend', 'size': 1_598_369},
        {'name': 'Tree03.blend', 'ext': '.blend', 'size': 1_400_000},
        {'name': 'Tree02.blend', 'ext': '.blend', 'size': 1_390_580},
        {'name': 'Tree01.blend', 'ext': '.blend', 'size': 1_350_000},
        {'name': 'Fence01.blend', 'ext': '.blend', 'size': 1_271_868},
        {'name': 'Gate01.blend', 'ext': '.blend', 'size': 1_260_000},
        {'name': 'Cart01.blend', 'ext': '.blend', 'size': 1_250_000},
    ]
    names = [c['name'] for c in pick_geometry_records(records, 'village_blender', limit=10)]
    assert 'Cabin04A.blend' in names
    assert 'Tree03.blend' in names
    assert 'Fence01.blend' in names
    assert 'Gate01.blend' in names
    assert 'Cabin04B.blend' not in names


def test_village_extract_sort_keeps_large_cabin_a_first():
    keys = [
        ('Village (Blender 4.2.2)/Book01.blend', 1_266_472),
        ('Village (Blender 4.2.2)/Cabin04A.blend', 2_262_865),
        ('Village (Blender 4.2.2)/Grass01.blend', 1_252_184),
        ('Village (Blender 4.2.2)/Cabin01A.blend', 1_806_509),
    ]
    ordered = sorted(keys, key=lambda item: extract_sort_key(item[0], item[1], 'village_blender'))
    assert [Path(item[0]).name for item in ordered[:2]] == ['Cabin04A.blend', 'Cabin01A.blend']


def test_camera_stays_outside_village_cluster():
    assert is_authored_village_mesh_name('Building04_LOD0') is True
    assert is_authored_village_mesh_name('Roof04') is True
    assert is_authored_village_mesh_name('Pine_Tree_01') is False
    assert is_cabin_texture_name('Cabin01_ALB.png') is True
    assert is_cabin_texture_name('Wood_Log_Diffuse.jpg') is True
    assert is_cabin_texture_name('Village_Grass_Albedo.jpg') is False
    tight = village_orbit_radius(6.0, 5.0)
    wide = village_orbit_radius(20.0, 18.0)
    assert tight >= 16.0
    assert wide > tight
    assert wide <= 36.0
    # A 12x10 cluster must not use a radius that lands inside the AABB.
    assert tight > math.hypot(6.0, 5.0)


def test_world_camera_travels_mountains_to_village():
    keys = cinematic_world_camera_keys(
        -12.0, -10.0, 12.0, 10.0, 0.0, 8.0,
        forest_x=0.0, forest_y=38.0, forest_z=5.0,
        mountain_x=0.0, mountain_y=96.0, mountain_z=18.0,
    )
    assert len(keys) == 6
    pad = 6.0
    for key in keys:
        x, y, _z = key['camera']
        inside = (-12.0 - pad) <= x <= (12.0 + pad) and (-10.0 - pad) <= y <= (10.0 + pad)
        assert inside is False
    # Establish looks toward the mountains; the finish looks at the village.
    assert keys[0]['look'][1] > keys[5]['look'][1] + 40.0
    assert keys[0]['camera'][2] > keys[4]['camera'][2]
    looks = [tuple(key['look']) for key in keys]
    assert len(set(looks)) >= 5
    assert keys[0]['lens'] < keys[4]['lens']
    # Mid and late looks stay up-valley so 9:16 still stacks river/forest/peaks.
    for key in keys:
        assert key['look'][1] >= 10.0
        assert key['camera'][1] <= -36.0
        assert key['lens'] <= 28.0
    # Establish is a real pull-back; the finish is a closer stacked village beat.
    assert keys[0]['camera'][1] <= -70.0
    assert keys[0]['camera'][1] < keys[2]['camera'][1]
    assert keys[5]['camera'][1] >= -52.0
    assert keys[0]['camera'][2] > keys[5]['camera'][2] + 12.0


def test_mountain_extract_keeps_grassy_and_allows_large_blend():
    assert should_extract_member('Grassy.blend', 545_850_634, 'background_mountains') is True
    assert should_extract_member('SnowyMountains.blend', 545_850_634, 'village_blender') is False
    records = [
        {'name': 'SnowyMountains.blend', 'ext': '.blend', 'size': 543_122_262},
        {'name': 'Grassy.blend', 'ext': '.blend', 'size': 545_850_634},
        {'name': 'Meadow.blend', 'ext': '.blend', 'size': 543_810_762},
    ]
    chosen = pick_geometry_records(records, 'background_mountains', limit=1)
    assert chosen[0]['name'] == 'Grassy.blend'


def test_cinematic_camera_is_a_journey_not_an_orbit():
    keys = cinematic_camera_keys(
        -12.0, -10.0, 12.0, 10.0, 0.0, 8.0,
        forest_x=6.0, forest_y=28.0, forest_z=6.0,
    )
    assert len(keys) == 6
    pad = 6.0
    for key in keys:
        x, y, z = key['camera']
        inside = (-12.0 - pad) <= x <= (12.0 + pad) and (-10.0 - pad) <= y <= (10.0 + pad)
        assert inside is False
        assert z > 0.0
    def horiz(key):
        return math.hypot(key['camera'][0], key['camera'][1])
    # Establish and sky ending are wide; the cabin beat is closer.
    assert horiz(keys[0]) > horiz(keys[2])
    assert horiz(keys[5]) > horiz(keys[2])
    # Crane-up is the highest camera; sky look is above the village look.
    assert keys[5]['camera'][2] > keys[2]['camera'][2] + 10.0
    assert keys[5]['look'][2] > keys[0]['look'][2] + 8.0
    # Look targets travel; this is not one locked look-at.
    looks = [tuple(key['look']) for key in keys]
    assert len(set(looks)) >= 4
    assert keys[4]['look'][1] > keys[0]['look'][1]
    lenses = [key['lens'] for key in keys]
    assert len(set(lenses)) >= 3
    assert keys[0]['lens'] < keys[2]['lens']
    assert keys[5]['lens'] <= 26.0


def test_point_outside_aabb_pushes_interior_cameras():
    x, y = point_outside_aabb(0.0, 0.0, -8.0, -8.0, 8.0, 8.0, pad=6.0)
    assert abs(x) >= 16.0 or abs(y) >= 16.0
    kept = point_outside_aabb(40.0, -30.0, -8.0, -8.0, 8.0, 8.0, pad=6.0)
    assert kept == (40.0, -30.0)


def test_village_and_forest_camera_subjects_split():
    assert is_village_camera_subject_name('Building04_LOD0', 'TJ_village_blender_0_Cabin01A') is True
    assert is_village_camera_subject_name('Cart01', 'TJ_village_fbx_4_Cart01') is True
    assert is_village_camera_subject_name('Pine_01', 'TJ_forest_nature_0_Pine') is False
    assert is_forest_camera_subject_name('Pine_01', 'TJ_forest_nature_0_Pine') is True
    assert is_forest_camera_subject_name('Building04', 'TJ_village_blender_0_Cabin01A') is False
    assert is_village_camera_subject_name('Bush_03', 'TJ_village_project_PurchasedRoot') is False


def test_village_texture_extract_prefers_cabin_albedo_over_grass_cards():
    keys = [
        ('Village (Textures)/Grass01_ALB.png', 649_218),
        ('Village (Textures)/Book01_ALB.png', 25_537),
        ('Village (Textures)/Colored/Cabin01_ALB.png', 4_691_305),
        ('Village (Textures)/Cabin01_NRM.png', 12_124_981),
        ('Village (Textures)/Cabin01_ALB.png', 4_692_016),
    ]
    ordered = sorted(keys, key=lambda item: extract_sort_key(item[0], item[1], 'village_textures'))
    assert Path(ordered[0][0]).name == 'Cabin01_ALB.png'
    assert 'Cabin01_ALB.png' in Path(ordered[1][0]).name
    assert Path(ordered[-1][0]).name == 'Cabin01_NRM.png'


def test_ground_picker_rejects_grass01_cards():
    records = [
        {'name': 'Grass01_ALB.png', 'ext': '.png', 'size': 649_218},
        {'name': 'Colored/Grass01_ALB.png', 'ext': '.png', 'size': 364_320},
        {'name': 'Village_Dirt_Albedo.jpg', 'ext': '.jpg', 'size': 1_500_000},
    ]
    chosen = pick_ground_image_records(records)
    assert chosen['name'] == 'Village_Dirt_Albedo.jpg'
    assert is_grass_card_texture_name('Grass01_ALB.png') is True
    assert is_grass_card_texture_name('Cabin01_ALB.png') is False


def test_daylight_sky_picker_prefers_sk2_plate():
    class Fake(Path):
        def is_file(self):
            return True
        def stat(self):
            class S:
                st_size = 2_000_000
            return S()

    paths = [
        Fake('/tmp/sk4/0001.hdr'),
        Fake('/tmp/HDRi_JPG_Pack/sk2/Image0001.jpg'),
        Fake('/tmp/sk1/Image0003.jpg'),
    ]
    chosen = pick_daylight_sky_path(paths)
    assert chosen is not None
    assert 'sk2' in str(chosen) and '0001' in str(chosen)


def test_bank_flora_keeps_flowers_and_drops_lotus():
    assert is_foliage_card_name('Lotus Leaf_1_011') is True
    assert is_bank_flora_name('Floral_2_024') is True
    assert is_bank_flora_name('Lotus Leaf_1_011') is False
    assert is_bank_flora_name('Fallen Leaf_1_014') is True


def test_cabin_albedo_picker_prefers_colored_atlas():
    class Fake(Path):
        def __init__(self, value, size):
            super().__init__(value)
            self._size = size
        def is_file(self):
            return True
        def stat(self):
            class S:
                def __init__(self, size):
                    self.st_size = size
            return S(self._size)

    chosen = pick_cabin_albedo_path([
        Fake('/tmp/Village (Textures)/Grass01_ALB.png', 649_218),
        Fake('/tmp/Village (Textures)/Cabin01_ALB.png', 4_692_016),
        Fake('/tmp/Village (Textures)/Colored/Cabin01_ALB.png', 4_691_305),
    ])
    assert chosen is not None
    assert 'Colored' in str(chosen)


def test_camera_hero_rejects_lily_pad_and_water():
    assert is_camera_hero_name('Building04_LOD0') is True
    assert is_camera_hero_name('Roof04') is True
    assert is_camera_hero_name('Cabin01') is True
    assert is_foliage_card_name('LilyPad_Giant') is True
    assert is_camera_hero_name('LilyPad_Giant') is False
    assert is_water_or_ocean_name('Water_GN_Plane') is True
    assert is_camera_hero_name('Water_GN_Plane') is False
    assert is_high_lod_name('Building04_LOD2') is True
    assert is_high_lod_name('Building04_LOD0') is False


if __name__ == '__main__':
    test_dump_name_detects_combined_forest_kit()
    test_extract_skips_huge_obj_and_keeps_individual_assets()
    test_lookdev_intake_allows_verified_large_originals()
    test_geometry_picker_prefers_small_blend_over_combined_obj()
    test_fallback_to_dump_when_it_is_the_only_geometry()
    test_extract_sort_puts_individual_blend_before_dump_obj()
    test_hdri_extract_limit_is_small()
    test_extracts_mtl_sidecar_for_obj_materials()
    test_staging_names_are_rejected()
    test_geometry_file_limits_allow_density_without_dump()
    test_geometry_picker_skips_staging_when_heroes_exist()
    test_mesh_keep_rank_prefers_hero_over_flat_platform()
    test_ground_picker_prefers_grass_over_random_huge_atlas()
    test_ground_picker_skips_normal_maps()
    test_ground_picker_skips_high_contrast_leaf_tiles()
    test_village_picker_prefers_authored_blend_over_tiny_fbx()
    test_dominating_plane_is_rejected_for_camera_bounds()
    test_primitive_boxes_rank_behind_hero_meshes()
    test_village_picker_prefers_cabin_a_over_interior_and_skips_none()
    test_village_mix_prefers_trees_and_fence_over_cabin_b()
    test_village_extract_sort_keeps_large_cabin_a_first()
    test_camera_stays_outside_village_cluster()
    test_world_camera_travels_mountains_to_village()
    test_mountain_extract_keeps_grassy_and_allows_large_blend()
    test_cinematic_camera_is_a_journey_not_an_orbit()
    test_point_outside_aabb_pushes_interior_cameras()
    test_village_and_forest_camera_subjects_split()
    test_camera_hero_rejects_lily_pad_and_water()
    test_village_texture_extract_prefers_cabin_albedo_over_grass_cards()
    test_ground_picker_rejects_grass01_cards()
    test_daylight_sky_picker_prefers_sk2_plate()
    test_bank_flora_keeps_flowers_and_drops_lotus()
    test_cabin_albedo_picker_prefers_colored_atlas()
    print('showcase_original14_select_test PASS')

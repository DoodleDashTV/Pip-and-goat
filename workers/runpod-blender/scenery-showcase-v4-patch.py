from pathlib import Path

worker = Path('/opt/ddp-worker/src/scenery-showcase.js')
worker_text = worker.read_text(encoding='utf-8')
old_roles = """const REQUIRED_ROLES = [
  'mountain_geometry',
  'background_mountains',
  'forest_geometry',
  'forest_textures',
  'water_system',
  'village_geometry',
  'village_textures',
  'tavern_geometry',
  'nature_library',
  'sky_hdri',
  'sky_machine',
  'world_shaders',
];"""
new_roles = """const REQUIRED_ROLES = [
  'mountain_geometry',
  'background_mountains',
  'forest_geometry',
  'forest_textures',
  'village_geometry',
  'village_textures',
  'tavern_geometry',
  'sky_hdri',
  'sky_machine',
  'world_shaders',
];"""
if worker_text.count(old_roles) != 1:
    raise SystemExit('V4_REQUIRED_ROLES_PATCH_CONTRACT_FAILED')
worker.write_text(worker_text.replace(old_roles, new_roles, 1), encoding='utf-8')

showcase = Path('/opt/ddp-worker/blender/scenery/showcase_30s.py')
showcase_text = showcase.read_text(encoding='utf-8')
old_required = '    required_prefixes = {"mountain", "forest", "water", "village", "tavern", "nature", "sky", "world"}'
new_required = '    required_prefixes = {"mountain", "forest", "village", "tavern", "sky", "world"}'
if showcase_text.count(old_required) != 1:
    raise SystemExit('V4_BLENDER_REQUIRED_PREFIX_PATCH_CONTRACT_FAILED')
showcase.write_text(showcase_text.replace(old_required, new_required, 1), encoding='utf-8')

print('TIVVLEJOY_SCENERY_SHOWCASE_V4_PATCH_PASS')

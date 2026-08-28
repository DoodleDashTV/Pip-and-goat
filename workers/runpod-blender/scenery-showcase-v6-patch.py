from pathlib import Path

# V6 is a thin patch over the immutable V5 image. It keeps every V5 Blender
# resilience repair and adds source-first selection, progress markers, and
# visible use of background/village-texture roles.

roles = Path('/opt/ddp-worker/src/scenery-showcase-roles.js')
text = roles.read_text(encoding='utf-8')
old = """  if (/wrapper|backup|historical|ue5/i.test(key)) value -= 60;\n  value += Math.min(24, Math.log2(Math.max(1, item.size / (1024 * 1024))) * 2);"""
new = """  // Prefer the original purchased source package over expanded/compat copies.\n  if (/\\/source\\//i.test(key)) value += 180;\n  if (/showcase-compat|wrapper|backup|historical|ue5/i.test(key)) value -= 90;\n  const sizeMb = Math.max(1, item.size / (1024 * 1024));\n  value += Math.min(12, Math.log2(sizeMb));\n  value -= Math.min(110, Math.log2(sizeMb) * 8);"""
if text.count(old) != 1:
    raise SystemExit('V6_ROLE_SCORE_PATCH_CONTRACT_FAILED')
roles.write_text(text.replace(old, new, 1), encoding='utf-8')

worker = Path('/opt/ddp-worker/src/scenery-showcase.js')
text = worker.read_text(encoding='utf-8')
old = """      log('private_scenery_materialized', { role: asset.role, byteSize: observedBytes, sha256: digest });"""
new = """      log('private_scenery_materialized', { role: asset.role, byteSize: observedBytes, sha256: digest });\n      await writeJson(startupKey, {\n        jobId, result: 'RUNNING', stage: 'MATERIALIZE_PRIVATE_ASSETS',\n        completedAssets: i + 1, totalAssets: selection.selected.length,\n        completedRole: asset.role, completedBytes: localAssets.reduce((sum, x) => sum + Number(x.byteSize || 0), 0),\n        selectedTotalBytes: selection.totalBytes, at: new Date().toISOString(),\n      });"""
if text.count(old) != 1:
    raise SystemExit('V6_PROGRESS_PATCH_CONTRACT_FAILED')
worker.write_text(text.replace(old, new, 1), encoding='utf-8')

showcase = Path('/opt/ddp-worker/blender/scenery/showcase_30s.py')
text = showcase.read_text(encoding='utf-8')
old = '''def create_river(water_material: bpy.types.Material | None) -> None:\n'''
new = '''def create_village_path(village_files: list[Path]) -> None:\n    # Authored path geometry uses texture content from the purchased Village texture pack.\n    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -1, 0.035))\n    path_obj = bpy.context.object\n    path_obj.name = "TJ_VillagePath_FromPurchasedTextures"\n    path_obj.scale = (11.0, 46.0, 1.0)\n    tex = find_texture(village_files, ("base", "color"))\n    if tex is None:\n        tex = find_texture(village_files, ())\n    mat = image_material("TJ_VillageTexturePack_Visible", tex, 0.82)\n    path_obj.data.materials.append(mat)\n\n\ndef create_river(water_material: bpy.types.Material | None) -> None:\n'''
if text.count(old) != 1:
    raise SystemExit('V6_VILLAGE_PATH_FUNCTION_PATCH_CONTRACT_FAILED')
text = text.replace(old, new, 1)
old = '''    placements = {\n        "mountain": (165.0, (0.0, 136.0, 0.0)),\n'''
new = '''    placements = {\n        "background": (225.0, (0.0, 164.0, -3.0)),\n        "mountain": (165.0, (0.0, 136.0, 0.0)),\n'''
if text.count(old) != 1:
    raise SystemExit('V6_BACKGROUND_PLACEMENT_PATCH_CONTRACT_FAILED')
text = text.replace(old, new, 1)
old = '''    forest_files = [p for role, files in expanded.items() if role.startswith("forest") for p in files]\n    create_ground(forest_files)\n\n    water_material = choose_loaded_material(r"water|river|stream|lake")\n'''
new = '''    forest_files = [p for role, files in expanded.items() if role.startswith("forest") for p in files]\n    create_ground(forest_files)\n    village_files = [p for role, files in expanded.items() if role.startswith("village") for p in files]\n    create_village_path(village_files)\n\n    water_material = choose_loaded_material(r"water|river|stream|lake")\n'''
if text.count(old) != 1:
    raise SystemExit('V6_VILLAGE_PATH_CALL_PATCH_CONTRACT_FAILED')
showcase.write_text(text.replace(old, new, 1), encoding='utf-8')

print('TIVVLEJOY_SCENERY_SHOWCASE_V6_PATCH_PASS')

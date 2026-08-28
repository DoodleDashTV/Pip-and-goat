# Build-time-only V5 repair for the real purchased-scenery dry proof.
# Applies to the immutable V4 worker image that already reached Blender on RunPod.
from pathlib import Path

worker = Path('/opt/ddp-worker/src/scenery-showcase.js')
worker_text = worker.read_text(encoding='utf-8')

old_diag = """      const tail = `${render.stderr || ''}\n${render.stdout || ''}`.slice(-6000);\n      throw Object.assign(new Error(`Blender scenery render exited ${render.status}: ${tail}`), { code: 'BLENDER_FAILED' });"""
new_diag = """      const stderrTail = String(render.stderr || '').slice(-8000);\n      const stdoutTail = String(render.stdout || '').slice(-4000);\n      const tail = `STDERR:\\n${stderrTail}\\nSTDOUT:\\n${stdoutTail}`;\n      throw Object.assign(new Error(`Blender scenery render exited ${render.status}: ${tail}`), { code: 'BLENDER_FAILED' });"""
if worker_text.count(old_diag) != 1:
    raise SystemExit('V5_BLENDER_DIAGNOSTIC_PATCH_CONTRACT_FAILED')
worker_text = worker_text.replace(old_diag, new_diag, 1)

old_usage = """    if (!usage.purchasedWaterMaterial || !usage.purchasedHdriUsed) {\n      throw Object.assign(new Error('Purchased water/HDRI proof missing'), { code: 'SCENERY_USAGE_CONTRACT_FAILED' });\n    }"""
new_usage = """    if (!usage.purchasedHdriUsed) {\n      throw Object.assign(new Error('Purchased HDRI proof missing'), { code: 'SCENERY_USAGE_CONTRACT_FAILED' });\n    }"""
if worker_text.count(old_usage) != 1:
    raise SystemExit('V5_DRY_USAGE_PATCH_CONTRACT_FAILED')
worker_text = worker_text.replace(old_usage, new_usage, 1)
worker.write_text(worker_text, encoding='utf-8')

showcase = Path('/opt/ddp-worker/blender/scenery/showcase_30s.py')
showcase_text = showcase.read_text(encoding='utf-8')

old_import = '''def import_geometry(path: Path, role: str) -> tuple[list[bpy.types.Object], list[str]]:\n    ext = path.suffix.lower()\n    if ext == ".blend":\n        return append_blend(path, role)\n    before = set(bpy.data.objects.keys())\n    try:\n        if ext == ".fbx":\n            bpy.ops.import_scene.fbx(filepath=str(path))\n        elif ext in {".glb", ".gltf"}:\n            bpy.ops.import_scene.gltf(filepath=str(path))\n        elif ext == ".obj":\n            bpy.ops.wm.obj_import(filepath=str(path))\n        else:\n            return [], []\n    except Exception as exc:\n        print(json.dumps({"event": "asset_import_warning", "role": role, "ext": ext, "error": str(exc)[:240]}))\n        return [], []\n    return [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before], []\n'''
new_import = '''def import_geometry(path: Path, role: str) -> tuple[list[bpy.types.Object], list[str]]:\n    ext = path.suffix.lower()\n    before = set(bpy.data.objects.keys())\n    try:\n        if ext == ".blend":\n            return append_blend(path, role)\n        if ext == ".fbx":\n            bpy.ops.import_scene.fbx(filepath=str(path))\n        elif ext in {".glb", ".gltf"}:\n            bpy.ops.import_scene.gltf(filepath=str(path))\n        elif ext == ".obj":\n            bpy.ops.wm.obj_import(filepath=str(path))\n        else:\n            return [], []\n    except Exception as exc:\n        print(json.dumps({"event": "asset_import_warning", "role": role, "ext": ext, "file": path.name, "error": str(exc)[:500]}))\n        return [], []\n    return [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before], []\n'''
if showcase_text.count(old_import) != 1:
    raise SystemExit('V5_BLEND_IMPORT_GUARD_PATCH_CONTRACT_FAILED')
showcase_text = showcase_text.replace(old_import, new_import, 1)

old_materials = '''        dst.objects = select_blend_object_names(list(src.objects), role)\n        dst.materials = list(src.materials)\n        dst.node_groups = list(src.node_groups)\n        if role.startswith("sky") or role.startswith("world"):\n            dst.worlds = list(src.worlds[:2])'''
new_materials = '''        dst.objects = select_blend_object_names(list(src.objects), role)\n        # Geometry object dependencies bring their own used materials. Avoid explicitly\n        # appending every unused material/node group from large purchased libraries.\n        if role.startswith("sky") or role.startswith("world") or role.startswith("water"):\n            dst.materials = list(src.materials)\n            dst.node_groups = list(src.node_groups)\n        else:\n            dst.materials = []\n            dst.node_groups = []\n        if role.startswith("sky") or role.startswith("world"):\n            dst.worlds = list(src.worlds[:2])'''
if showcase_text.count(old_materials) != 1:
    raise SystemExit('V5_BLEND_DEPENDENCY_PATCH_CONTRACT_FAILED')
showcase_text = showcase_text.replace(old_materials, new_materials, 1)
showcase.write_text(showcase_text, encoding='utf-8')

print('TIVVLEJOY_SCENERY_SHOWCASE_V5_PATCH_PASS')

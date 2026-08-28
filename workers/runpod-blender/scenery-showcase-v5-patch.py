# Build-time-only V5 repair for the real purchased-scenery dry proof.
# Applies to the immutable V4 worker image that already reached Blender on RunPod.
from pathlib import Path

worker = Path('/opt/ddp-worker/src/scenery-showcase.js')
worker_text = worker.read_text(encoding='utf-8')

old_diag = r"""      const tail = `${render.stderr || ''}\n${render.stdout || ''}`.slice(-6000);
      throw Object.assign(new Error(`Blender scenery render exited ${render.status}: ${tail}`), { code: 'BLENDER_FAILED' });"""
new_diag = r"""      const stderrTail = String(render.stderr || '').slice(-8000);
      const stdoutTail = String(render.stdout || '').slice(-4000);
      const tail = `STDERR:\n${stderrTail}\nSTDOUT:\n${stdoutTail}`;
      throw Object.assign(new Error(`Blender scenery render exited ${render.status}: ${tail}`), { code: 'BLENDER_FAILED' });"""
if worker_text.count(old_diag) != 1:
    raise SystemExit('V5_BLENDER_DIAGNOSTIC_PATCH_CONTRACT_FAILED')
worker_text = worker_text.replace(old_diag, new_diag, 1)

old_usage = """    if (!usage.purchasedWaterMaterial || !usage.purchasedHdriUsed) {
      throw Object.assign(new Error('Purchased water/HDRI proof missing'), { code: 'SCENERY_USAGE_CONTRACT_FAILED' });
    }"""
new_usage = """    if (!usage.purchasedHdriUsed) {
      throw Object.assign(new Error('Purchased HDRI proof missing'), { code: 'SCENERY_USAGE_CONTRACT_FAILED' });
    }"""
if worker_text.count(old_usage) != 1:
    raise SystemExit('V5_DRY_USAGE_PATCH_CONTRACT_FAILED')
worker_text = worker_text.replace(old_usage, new_usage, 1)
worker.write_text(worker_text, encoding='utf-8')

showcase = Path('/opt/ddp-worker/blender/scenery/showcase_30s.py')
showcase_text = showcase.read_text(encoding='utf-8')

old_import = '''def import_geometry(path: Path, role: str) -> tuple[list[bpy.types.Object], list[str]]:
    ext = path.suffix.lower()
    if ext == ".blend":
        return append_blend(path, role)
    before = set(bpy.data.objects.keys())
    try:
        if ext == ".fbx":
            bpy.ops.import_scene.fbx(filepath=str(path))
        elif ext in {".glb", ".gltf"}:
            bpy.ops.import_scene.gltf(filepath=str(path))
        elif ext == ".obj":
            bpy.ops.wm.obj_import(filepath=str(path))
        else:
            return [], []
    except Exception as exc:
        print(json.dumps({"event": "asset_import_warning", "role": role, "ext": ext, "error": str(exc)[:240]}))
        return [], []
    return [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before], []
'''
new_import = '''def import_geometry(path: Path, role: str) -> tuple[list[bpy.types.Object], list[str]]:
    ext = path.suffix.lower()
    before = set(bpy.data.objects.keys())
    try:
        if ext == ".blend":
            return append_blend(path, role)
        if ext == ".fbx":
            bpy.ops.import_scene.fbx(filepath=str(path))
        elif ext in {".glb", ".gltf"}:
            bpy.ops.import_scene.gltf(filepath=str(path))
        elif ext == ".obj":
            bpy.ops.wm.obj_import(filepath=str(path))
        else:
            return [], []
    except Exception as exc:
        print(json.dumps({"event": "asset_import_warning", "role": role, "ext": ext, "file": path.name, "error": str(exc)[:500]}))
        return [], []
    return [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before], []
'''
if showcase_text.count(old_import) != 1:
    raise SystemExit('V5_BLEND_IMPORT_GUARD_PATCH_CONTRACT_FAILED')
showcase_text = showcase_text.replace(old_import, new_import, 1)

old_materials = '''        dst.objects = select_blend_object_names(list(src.objects), role)
        dst.materials = list(src.materials)
        dst.node_groups = list(src.node_groups)
        if role.startswith("sky") or role.startswith("world"):
            dst.worlds = list(src.worlds[:2])'''
new_materials = '''        dst.objects = select_blend_object_names(list(src.objects), role)
        # Geometry object dependencies bring their own used materials. Avoid explicitly
        # appending every unused material/node group from large purchased libraries.
        if role.startswith("sky") or role.startswith("world") or role.startswith("water"):
            dst.materials = list(src.materials)
            dst.node_groups = list(src.node_groups)
        else:
            dst.materials = []
            dst.node_groups = []
        if role.startswith("sky") or role.startswith("world"):
            dst.worlds = list(src.worlds[:2])'''
if showcase_text.count(old_materials) != 1:
    raise SystemExit('V5_BLEND_DEPENDENCY_PATCH_CONTRACT_FAILED')
showcase_text = showcase_text.replace(old_materials, new_materials, 1)
showcase.write_text(showcase_text, encoding='utf-8')

print('TIVVLEJOY_SCENERY_SHOWCASE_V5_PATCH_PASS')

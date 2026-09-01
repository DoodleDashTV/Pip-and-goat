from pathlib import Path

# V6 is a thin patch over the immutable V5 image. It keeps every V5 Blender
# resilience repair and adds source-first selection, progress markers, and
# visible use of background/village-texture roles.

roles = Path('/opt/ddp-worker/src/scenery-showcase-roles.js')
roles.write_text(r"""'use strict';

// V6 purchased-scenery selector. Keep the V5 dry-proof contract at exactly
// ten roles while preferring original private source packages over expanded
// compatibility copies.
const REQUIRED_ROLES = [
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
];

const ROLE_RULES = {
  mountain_geometry: { include: ['3dt', 'mountain'], any: ['mountain pack', 'mountains.glb'], exclude: ['ue5', 'background'] },
  background_mountains: { any: ['louisbgmountains', 'background mountain', 'background_mountain', 'background-mountain'] },
  forest_geometry: { any: ['stylized forest', 'stylized_forest', 'stylised ecokit', 'stylised_ecokit', 'forest nature kit', 'forest_nature_kit', 'ecokit'], exclude: ['4096', '2048', '1024'] },
  forest_textures: { any: ['4096', 'forest texture', 'forest_texture', 'rocks_a', 'rocks_b', 'foliage_01', 'foliage_02'] },
  village_geometry: { any: ['village (fbx)', 'village_fbx', 'village (blender', 'village_blender', 'assembled project', '/source/village'], exclude: ['texture', 'unity'] },
  village_textures: { any: ['village (textures)', 'village texture', 'village_texture'] },
  tavern_geometry: { any: ['stylized tavern', 'stylized_tavern', 'tavern'], exclude: ['texture'] },
  sky_hdri: { any: ['/sk1.zip', 'sk1.zip', 'hdri_jpg_pack', 'hdri jpg pack', 'sky hdri', '.hdr'] },
  sky_machine: { any: ['skymachinev2', 'sky machine v2', 'sky_machine_v2'] },
  world_shaders: { any: ['world shaders', 'world_shaders', 'giveaway_world', 'giveaway world', 'physical starlight atmosphere', 'gaffer 3.2.10'] },
};

function lower(v) { return String(v || '').toLowerCase(); }

function isCommercialSceneryCandidate(item) {
  const k = lower(item && item.key);
  if (!k.startsWith('tivvlejoy-assets')) return false;
  if (k.includes('/characters/') || k.includes('/executions/') || k.includes('/qa/')) return false;
  if (k.endsWith('receipt.json') || k.endsWith('status.json') || k.endsWith('manifest.json') || k.includes('.part')) return false;
  return Number(item && item.size || 0) > 0;
}

function matchesRule(key, rule) {
  const k = lower(key);
  if ((rule.exclude || []).some((x) => k.includes(x))) return false;
  if (rule.include && !rule.include.every((x) => k.includes(x))) {
    if (!(rule.any || []).some((x) => k.includes(x))) return false;
  }
  if (!rule.include && !(rule.any || []).some((x) => k.includes(x))) return false;
  return true;
}

function score(item, role, rule) {
  const key = lower(item.key);
  if (!matchesRule(key, rule)) return -Infinity;
  const size = Number(item.size || 0);
  if (size <= 0 || size > 1500 * 1024 * 1024) return -Infinity;
  let value = 100;
  // Prefer the original purchased source package over expanded/compat copies.
  if (key.includes('/source/')) value += 180;
  if (key.includes('showcase-compat') || key.includes('wrapper') || key.includes('backup') || key.includes('historical') || key.includes('ue5')) value -= 90;
  if (key.endsWith('.blend')) value += 32;
  if (key.endsWith('.glb')) value += 30;
  if (key.endsWith('.fbx')) value += 28;
  if (key.endsWith('.zip')) value += 16;
  const sizeMb = Math.max(1, size / (1024 * 1024));
  value -= Math.min(110, Math.log2(sizeMb) * 8);
  return value;
}

function inspectRole(items, role, usedKeys = new Set()) {
  const rule = ROLE_RULES[role];
  const ranked = items
    .filter(isCommercialSceneryCandidate)
    .map((item) => ({ ...item, score: score(item, role, rule), used: usedKeys.has(item.key) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || Number(a.size || 0) - Number(b.size || 0));
  return { role, choice: ranked.find((item) => !item.used) || null, ranked };
}

function selectAssets(items, options = {}) {
  const selected = [];
  const usedKeys = new Set();
  for (const role of REQUIRED_ROLES) {
    const inspection = inspectRole(items, role, usedKeys);
    if (!inspection.choice) {
      throw Object.assign(new Error(`Required purchased scenery role missing: ${role}`), {
        code: 'SCENERY_ROLE_MISSING', role, inspection, selected,
      });
    }
    usedKeys.add(inspection.choice.key);
    const { score: ignoredScore, used: ignoredUsed, ...choice } = inspection.choice;
    selected.push({ role, ...choice });
  }
  const totalBytes = selected.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const hardMaterializeCap = Number(options.maxInputBytes || process.env.SCENERY_SHOWCASE_MAX_INPUT_BYTES || 5 * 1024 * 1024 * 1024);
  if (totalBytes > hardMaterializeCap) {
    throw Object.assign(new Error(`Selected scenery input ${totalBytes} exceeds hard materialization cap ${hardMaterializeCap}`), {
      code: 'SCENERY_INPUT_CAP', totalBytes, hardMaterializeCap, selected,
    });
  }
  return {
    selected,
    totalBytes,
    listedObjectCount: items.length,
    commercialCandidateCount: items.filter(isCommercialSceneryCandidate).length,
  };
}

function trySelectAssets(items, options = {}) {
  try { return { ok: true, missingRole: null, ...selectAssets(items, options) }; }
  catch (error) {
    return {
      ok: false,
      missingRole: error.role || null,
      code: error.code || 'SCENERY_SELECT_FAILED',
      message: String(error.message || error),
      selected: error.selected || [],
      totalBytes: (error.selected || []).reduce((sum, item) => sum + Number(item.size || 0), 0),
    };
  }
}

module.exports = { REQUIRED_ROLES, ROLE_RULES, isCommercialSceneryCandidate, inspectRole, selectAssets, trySelectAssets };
""", encoding='utf-8')

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

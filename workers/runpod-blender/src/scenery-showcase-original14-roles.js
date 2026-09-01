'use strict';

const { createHash } = require('node:crypto');

const SOURCE_SPECS = [
  { role:'village_blender', sourceId:'SRC_VILLAGE_BLEND_ZIP', filename:'Village (Blender 4.2.2).zip', collection:'Village', unityPreservationOnly:false },
  { role:'village_textures', sourceId:'SRC_VILLAGE_TEXTURES_ZIP', filename:'Village (Textures).zip', collection:'Village', unityPreservationOnly:false },
  { role:'village_project', sourceId:'SRC_VILLAGE_PROJECT_ZIP', filename:'Project File.zip', collection:'Village', unityPreservationOnly:false },
  { role:'village_fbx', sourceId:'SRC_VILLAGE_FBX_ZIP', filename:'Village (FBX).zip', collection:'Village', unityPreservationOnly:false },
  { role:'village_unity_builtin', sourceId:'SRC_VILLAGE_UNITY_BUILTIN', filename:'Village - Built-in (Unity 2022.3.16f1).unitypackage.gz', collection:'Village', unityPreservationOnly:true },
  { role:'village_unity_urp', sourceId:'SRC_VILLAGE_UNITY_URP', filename:'Village - URP (Unity 2022.3.16f1).unitypackage.gz', collection:'Village', unityPreservationOnly:true },
  { role:'village_unity_hdrp', sourceId:'SRC_VILLAGE_UNITY_HDRP', filename:'Village - HDRP (Unity 2022.3.16f1).unitypackage.gz', collection:'Village', unityPreservationOnly:true },
  { role:'sky_machine_v1', sourceId:'SRC_SKY_MACHINE_V1_ZIP', filename:'SkyMachineV1.zip', collection:'Sky/HDRI', unityPreservationOnly:false },
  { role:'sky_machine_v2', sourceId:'SRC_SKY_MACHINE_V2_ZIP', filename:'SkyMachineV2.zip', collection:'Sky/HDRI', unityPreservationOnly:false },
  { role:'sky_extra_update', sourceId:'SRC_SKY_EXTRA_UPDATE_ZIP', filename:'Extra Update 1.zip', collection:'Sky/HDRI', unityPreservationOnly:false },
  { role:'sky_hdri', sourceId:'SRC_SKY_HDRI_JPG_PACK', filename:'HDRi_JPG_Pack.zip', collection:'Sky/HDRI', unityPreservationOnly:false },
  { role:'forest_nature', sourceId:'SRC_FOREST_MODEL_PACKAGE', filename:'Stylized_Forest_Nature_Kit.zip', collection:'Stylized Forest/EcoKit', unityPreservationOnly:false },
  { role:'forest_ecokit', sourceId:'SRC_FOREST_STYLISED_ECOKIT', filename:'Stylised EcoKit.zip', collection:'Stylized Forest/EcoKit', unityPreservationOnly:false },
  { role:'world_shaders', sourceId:'SRC_SKY_WORLD_SHADERS_GIVEAWAY', filename:'Giveaway_World Shaders.zip', collection:'World Shaders', unityPreservationOnly:false },
];

const EXTRA_SOURCE_SPECS = [
  { role:'background_mountains', sourceId:'SRC_LOUIS_BG_MOUNTAINS_V1', filename:'LouisBGMountainsV1.zip', collection:'Mountains', unityPreservationOnly:false, extra:true },
];

const REQUIRED_ROLES = SOURCE_SPECS.map((x) => x.role);
// Exact verified originals total ~3.00 GB. Keep a hard ceiling below the legacy
// 5 GB showcase cap while allowing the complete purchased Original-14 set.
const ORIGINAL_14_HARD_CAP = 4 * 1024 * 1024 * 1024;

function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function base(key) { const p=String(key||'').split('/'); return p[p.length-1] || String(key||''); }
function commercial(item) {
  const k=String(item?.key||'').toLowerCase();
  if (!k.startsWith('tivvlejoy-assets')) return false;
  if (k.includes('/characters/') || k.includes('/executions/') || k.includes('/qa/')) return false;
  if (k.endsWith('receipt.json') || k.endsWith('status.json') || k.endsWith('manifest.json') || k.includes('.part')) return false;
  return Number(item?.size||0) > 0;
}
function score(item, spec) {
  if (!commercial(item)) return -Infinity;
  const full=norm(item.key), basename=norm(base(item.key)), filename=norm(spec.filename), sourceId=norm(spec.sourceId);
  const direct=basename===filename || basename.endsWith(filename);
  const byName=full.includes(filename);
  const byId=full.includes(sourceId);
  if (!direct && !byName && !byId) return -Infinity;
  let value=100;
  if (direct) value+=300;
  if (byName) value+=160;
  if (byId) value+=140;
  const lower=String(item.key).toLowerCase();
  if (lower.includes('/source/')) value+=220;
  if (lower.includes('/uploads/') || lower.includes('/original/')) value+=100;
  if (lower.includes('showcase-compat') || lower.includes('/archive-content/') || lower.includes('/derived/') || lower.includes('/normalized/')) value-=220;
  value-=Math.min(100, Math.log2(Math.max(1, Number(item.size||0)/(1024*1024)))*3);
  return value;
}
function specFor(role) {
  return SOURCE_SPECS.find((x)=>x.role===role) || EXTRA_SOURCE_SPECS.find((x)=>x.role===role) || null;
}
function inspectRole(items, role, usedKeys=new Set()) {
  const spec=specFor(role);
  if (!spec) return { role, choice:null, ranked:[] };
  const ranked=items.map((item)=>({ ...item, score:score(item,spec), used:usedKeys.has(item.key) }))
    .filter((x)=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score || Number(a.size||0)-Number(b.size||0));
  return { role, choice:ranked.find((x)=>!x.used)||null, ranked };
}
function selectAssets(items, options={}) {
  const selected=[]; const used=new Set();
  for (const spec of SOURCE_SPECS) {
    const inspection=inspectRole(items,spec.role,used);
    if (!inspection.choice) throw Object.assign(new Error(`Original purchased scenery source missing: ${spec.sourceId}`), { code:'ORIGINAL_14_SOURCE_MISSING', role:spec.role, sourceId:spec.sourceId, selected });
    used.add(inspection.choice.key);
    const { score:_score, used:_used, ...choice }=inspection.choice;
    selected.push({ role:spec.role, sourceId:spec.sourceId, collection:spec.collection, unityPreservationOnly:spec.unityPreservationOnly, ...choice });
  }
  const totalBytes=selected.reduce((sum,x)=>sum+Number(x.size||0),0);
  const envCap=Number(options.maxInputBytes || process.env.SCENERY_SHOWCASE_MAX_INPUT_BYTES || ORIGINAL_14_HARD_CAP);
  const cap=Math.min(envCap, ORIGINAL_14_HARD_CAP);
  if (totalBytes>cap) throw Object.assign(new Error(`Original-14 selection ${totalBytes} exceeds ${cap}`), { code:'ORIGINAL_14_INPUT_CAP', totalBytes, hardMaterializeCap:cap, selected });
  return {
    selected,
    totalBytes,
    listedObjectCount:items.length,
    commercialCandidateCount:items.filter(commercial).length,
    originalSourceCount:selected.length,
    renderableSourceCount:selected.filter((x)=>!x.unityPreservationOnly).length,
    unityPreservationOnlyCount:selected.filter((x)=>x.unityPreservationOnly).length,
    collectionCount:new Set(selected.map((x)=>x.collection)).size,
    objectIdentityManifest:selected.map((x)=>({ role:x.role, sourceId:x.sourceId, objectIdentity:createHash('sha256').update(x.key).digest('hex'), byteSize:x.size, unityPreservationOnly:x.unityPreservationOnly })),
  };
}
function trySelectAssets(items, options={}) {
  try { return { ok:true, missingRole:null, ...selectAssets(items,options) }; }
  catch (error) { return { ok:false, missingRole:error.role||null, code:error.code||'ORIGINAL_14_SELECT_FAILED', message:String(error.message||error), selected:error.selected||[], totalBytes:(error.selected||[]).reduce((s,x)=>s+Number(x.size||0),0) }; }
}
function selectExtraAssets(items, usedKeys=new Set(), options={}) {
  const selected=[];
  const used=new Set(usedKeys);
  for (const spec of EXTRA_SOURCE_SPECS) {
    const inspection=inspectRole(items,spec.role,used);
    if (!inspection.choice) throw Object.assign(new Error(`Purchased extra scenery source missing: ${spec.sourceId}`), { code:'ORIGINAL_14_EXTRA_SOURCE_MISSING', role:spec.role, sourceId:spec.sourceId, selected });
    used.add(inspection.choice.key);
    const { score:_score, used:_used, ...choice }=inspection.choice;
    selected.push({ role:spec.role, sourceId:spec.sourceId, collection:spec.collection, unityPreservationOnly:false, extra:true, ...choice });
  }
  const extraBytes=selected.reduce((sum,x)=>sum+Number(x.size||0),0);
  const already=Number(options.alreadyBytes||0);
  const envCap=Number(options.maxInputBytes || process.env.SCENERY_SHOWCASE_MAX_INPUT_BYTES || ORIGINAL_14_HARD_CAP);
  const cap=Math.min(envCap, ORIGINAL_14_HARD_CAP);
  if (already+extraBytes>cap) throw Object.assign(new Error(`Original-14 plus extras ${already+extraBytes} exceeds ${cap}`), { code:'ORIGINAL_14_EXTRA_INPUT_CAP', totalBytes:already+extraBytes, hardMaterializeCap:cap, selected });
  return { selected, extraBytes, extraSourceCount:selected.length };
}

module.exports={ REQUIRED_ROLES, SOURCE_SPECS, EXTRA_SOURCE_SPECS, ORIGINAL_14_HARD_CAP, inspectRole, selectAssets, trySelectAssets, selectExtraAssets };

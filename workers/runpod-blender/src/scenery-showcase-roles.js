'use strict';

/**
 * Shared purchased-scenery role selection for the 30s showcase.
 *
 * This is the worker-equivalent unique-key + maxBytes selector. Bridge
 * preflight must not treat independent regex hits as ready; it has to run
 * these exact rules against distinct unused object keys.
 */

const REQUIRED_ROLES = [
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
];

const ROLE_RULES = {
  mountain_geometry: {
    include: [/3dt.*mountain/i, /mountain.*pack/i, /mountains.*glb/i],
    prefer: [/\.glb$/i, /blender\.zip$/i, /fbx.*textures\.zip$/i],
    exclude: [/ue5/i, /background/i],
  },
  background_mountains: {
    include: [/louisbgmountains/i, /background.*mountain/i],
    prefer: [/\.zip$/i, /\.blend$/i, /\.fbx$/i],
  },
  forest_geometry: {
    include: [/stylized.*forest/i, /stylised.*ecokit/i, /forest.*nature.*kit/i, /ecokit/i],
    prefer: [/\.zip$/i, /\.blend$/i, /\.fbx$/i, /\.glb$/i],
    exclude: [/4096|2048|1024/i],
  },
  forest_textures: {
    include: [/4096/i, /forest.*texture/i, /rocks_[ab]/i, /foliage_0[12]/i],
    prefer: [/4096.*\.zip$/i, /\.zip$/i],
  },
  water_system: {
    include: [/water[_ -]?mat.*gn/i, /water.*\.blend$/i, /river.*\.blend$/i],
    prefer: [/water[_ -]?mat.*gn.*\.blend$/i, /\.blend$/i],
  },
  village_geometry: {
    include: [/village.*fbx/i, /village.*blender/i, /assembled.*project.*\.blend/i, /source\/village/i],
    prefer: [/village.*fbx.*\.zip$/i, /assembled.*\.blend$/i, /blender.*\.zip$/i],
    exclude: [/texture/i, /unity/i],
  },
  village_textures: {
    include: [/village.*texture/i],
    prefer: [/\.zip$/i],
  },
  tavern_geometry: {
    include: [/stylized.*tavern.*interior.*\.blend/i, /stylized.*tavern.*package.*\.fbx/i, /tavern/i],
    prefer: [/\.blend$/i, /\.fbx$/i, /\.blend\.zip$/i, /package\.zip$/i],
    exclude: [/texture/i],
  },
  nature_library: {
    include: [/procedural.*nature/i, /assets library/i, /flora/i, /rock[_ -]?model/i, /scatter/i, /botaniq_full-7\.2\.0/i],
    prefer: [/\.blend$/i, /assets library\.zip$/i, /\.zip$/i],
    exclude: [/geoscatter.*biomes/i],
    maxBytes: 900 * 1024 * 1024,
  },
  sky_hdri: {
    include: [/(^|\/)sk1\.zip$/i, /hdri.*jpg.*pack/i, /sky.*hdri/i, /\.hdr$/i],
    prefer: [/sk1\.zip$/i, /\.hdr$/i, /hdri.*\.zip$/i],
  },
  sky_machine: {
    include: [/skymachinev2/i, /sky.*machine.*v2/i],
    prefer: [/skymachinev2\.zip$/i, /\.blend$/i],
  },
  world_shaders: {
    include: [/world.*shaders/i, /giveaway.*world/i, /physical[_ -]?starlight[_ -]?atmosphere-1\.9\.4/i, /gaffer 3\.2\.10/i],
    prefer: [/world.*shaders.*\.zip$/i, /physical.*1\.9\.4.*\.zip$/i, /gaffer 3\.2\.10.*\.zip$/i],
  },
};

const NATURE_LIBRARY_ALIAS_KEY = 'tivvlejoy-assets/showcase-compat/Assets Library.zip';
const NATURE_LIBRARY_ALIAS_SOURCE_KEY = 'tivvlejoy-assets/source/stylized-forest/Stylized_Forest_Nature_Kit.zip';

function isCommercialSceneryCandidate(item) {
  const k = String(item?.key || '').toLowerCase();
  if (!k.startsWith('tivvlejoy-assets')) return false;
  if (/\/characters\//.test(k)) return false;
  if (/\/executions\//.test(k)) return false;
  if (/\/qa\//.test(k)) return false;
  if (/receipt\.json$|status\.json$|manifest\.json$|\.part\b/.test(k)) return false;
  return true;
}

function roleMaxBytes(rule) {
  return Number(rule.maxBytes || 1500 * 1024 * 1024);
}

function rejectReasons(item, rule) {
  const key = String(item?.key || '');
  const reasons = [];
  if (!rule.include.some((rx) => rx.test(key))) reasons.push('no_include');
  if (rule.exclude && rule.exclude.some((rx) => rx.test(key))) reasons.push('exclude');
  if (item.size > roleMaxBytes(rule)) reasons.push(`maxBytes>${Math.round(roleMaxBytes(rule) / (1024 * 1024))}MiB`);
  return reasons;
}

function score(item, role, rule) {
  const key = item.key;
  if (rule.exclude && rule.exclude.some((rx) => rx.test(key))) return -Infinity;
  if (!rule.include.some((rx) => rx.test(key))) return -Infinity;
  if (item.size > roleMaxBytes(rule)) return -Infinity;
  let value = 100;
  for (let i = 0; i < (rule.prefer || []).length; i += 1) {
    if (rule.prefer[i].test(key)) value += 80 - i * 8;
  }
  if (/\.blend$/i.test(key)) value += 32;
  if (/\.glb$/i.test(key)) value += 30;
  if (/\.fbx$/i.test(key)) value += 28;
  if (/\.zip$/i.test(key)) value += 16;
  if (/wrapper|backup|historical|ue5/i.test(key)) value -= 60;
  value += Math.min(24, Math.log2(Math.max(1, item.size / (1024 * 1024))) * 2);
  return value;
}

function independentRoleSnapshot(items) {
  const candidates = items.filter(isCommercialSceneryCandidate);
  const roles = {};
  const missingRoles = [];
  for (const role of REQUIRED_ROLES) {
    const rule = ROLE_RULES[role];
    const ok = candidates.some((item) => rule.include.some((rx) => rx.test(item.key)));
    roles[role] = ok;
    if (!ok) missingRoles.push(role);
  }
  return {
    ok: missingRoles.length === 0,
    satisfiedRoleCount: Object.values(roles).filter(Boolean).length,
    roles,
    missingRoles,
    listedObjectCount: items.length,
    commercialCandidateCount: candidates.length,
  };
}

function inspectRole(items, role, usedKeys = new Set()) {
  const rule = ROLE_RULES[role];
  const candidates = items.filter(isCommercialSceneryCandidate);
  const includeHits = candidates.filter((item) => rule.include.some((rx) => rx.test(item.key)));
  const ranked = [];
  const rejected = [];
  for (const item of includeHits) {
    const value = score(item, role, rule);
    const rec = {
      key: item.key,
      size: item.size,
      used: usedKeys.has(item.key),
    };
    if (!Number.isFinite(value)) {
      rejected.push({ ...rec, reasons: rejectReasons(item, rule) });
      continue;
    }
    ranked.push({ ...rec, score: value });
  }
  ranked.sort((a, b) => b.score - a.score || a.size - b.size);
  return {
    role,
    choice: ranked.find((entry) => !entry.used) || null,
    ranked,
    rejected,
  };
}

function selectAssets(items, options = {}) {
  const candidates = items.filter(isCommercialSceneryCandidate);
  const selected = [];
  const usedKeys = new Set();
  const inspections = [];
  for (const role of REQUIRED_ROLES) {
    const inspection = inspectRole(items, role, usedKeys);
    inspections.push(inspection);
    if (!inspection.choice) {
      const error = Object.assign(new Error(`Required purchased scenery role missing: ${role}`), {
        code: 'SCENERY_ROLE_MISSING',
        role,
        inspection,
        selected,
      });
      throw error;
    }
    usedKeys.add(inspection.choice.key);
    const item = candidates.find((entry) => entry.key === inspection.choice.key);
    selected.push({ role, ...item });
  }
  const totalBytes = selected.reduce((sum, item) => sum + item.size, 0);
  const hardMaterializeCap = Number(
    options.maxInputBytes || process.env.SCENERY_SHOWCASE_MAX_INPUT_BYTES || 5 * 1024 * 1024 * 1024,
  );
  if (totalBytes > hardMaterializeCap) {
    throw Object.assign(
      new Error(`Selected scenery input ${totalBytes} exceeds hard materialization cap ${hardMaterializeCap}`),
      { code: 'SCENERY_INPUT_CAP', totalBytes, hardMaterializeCap, selected },
    );
  }
  return {
    selected,
    totalBytes,
    listedObjectCount: items.length,
    commercialCandidateCount: candidates.length,
    inspections,
  };
}

function trySelectAssets(items, options = {}) {
  try {
    const result = selectAssets(items, options);
    return { ok: true, missingRole: null, ...result };
  } catch (error) {
    return {
      ok: false,
      missingRole: error.role || null,
      code: error.code || 'SCENERY_SELECT_FAILED',
      message: String(error.message || error),
      selected: error.selected || [],
      inspection: error.inspection || null,
      totalBytes: (error.selected || []).reduce((sum, item) => sum + Number(item.size || 0), 0),
    };
  }
}

module.exports = {
  REQUIRED_ROLES,
  ROLE_RULES,
  NATURE_LIBRARY_ALIAS_KEY,
  NATURE_LIBRARY_ALIAS_SOURCE_KEY,
  isCommercialSceneryCandidate,
  independentRoleSnapshot,
  inspectRole,
  selectAssets,
  trySelectAssets,
};

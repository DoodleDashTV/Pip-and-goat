import type { HierarchyNodeEvidence, SceneAssemblyEvidence } from './types';

const MAP_NAMES = [/AdventureMap/i, /adventure_map/i, /MeadowMap/i];
const MAPMARK_NAMES = [/MapMark/i];

export function findNodes(hierarchy: HierarchyNodeEvidence[], pattern: RegExp): HierarchyNodeEvidence[] {
  return hierarchy.filter((n) => pattern.test(n.name));
}

/**
 * MapMark hierarchy contract:
 * - MapMark must exist when a map asset is present
 * - MapMark must remain attached (same parent group / sibling under shared parent, or parented)
 * - Multi-object map must not be split by placement of only one mesh
 */
export function evaluateMapMarkHierarchy(hierarchy: HierarchyNodeEvidence[]): {
  ok: boolean;
  reason: string;
  mapPresent: boolean;
  mapMarkPresent: boolean;
} {
  const maps = MAP_NAMES.flatMap((p) => findNodes(hierarchy, p));
  const marks = MAPMARK_NAMES.flatMap((p) => findNodes(hierarchy, p));
  const mapPresent = maps.length > 0;
  const mapMarkPresent = marks.length > 0;

  if (!mapPresent) {
    // Map optional for some unit fixtures; hierarchy gate still checks characters.
    return {
      ok: true,
      reason: 'no map asset in evidence; MapMark check skipped',
      mapPresent,
      mapMarkPresent,
    };
  }
  if (!mapMarkPresent) {
    return {
      ok: false,
      reason: 'map present but MapMark missing',
      mapPresent,
      mapMarkPresent,
    };
  }

  const map = maps[0]!;
  const mark = marks[0]!;
  const sharedParent =
    (map.parentName && mark.parentName && map.parentName === mark.parentName) ||
    mark.parentName === map.name ||
    (map.children || []).includes(mark.name);

  if (!sharedParent) {
    return {
      ok: false,
      reason: `MapMark detached from map hierarchy (map.parent=${map.parentName ?? 'null'}, mark.parent=${mark.parentName ?? 'null'})`,
      mapPresent,
      mapMarkPresent,
    };
  }

  return {
    ok: true,
    reason: 'MapMark attached within map hierarchy',
    mapPresent,
    mapMarkPresent,
  };
}

export function evaluateCharacterAccessoryHierarchy(hierarchy: HierarchyNodeEvidence[]): {
  ok: boolean;
  reason: string;
  issues: string[];
} {
  const issues: string[] = [];
  const byName = new Map(hierarchy.map((n) => [n.name, n]));

  const requireParented = (childName: string, parentHints: RegExp[]) => {
    const child = byName.get(childName);
    if (!child) {
      issues.push(`missing accessory/object: ${childName}`);
      return;
    }
    const parent = child.parentName ? byName.get(child.parentName) : null;
    const parentOk =
      !!child.parentName &&
      (parentHints.some((p) => p.test(child.parentName || '')) ||
        (parent != null && parentHints.some((p) => p.test(parent.name))));
    if (!parentOk) {
      issues.push(`${childName} not attached (parent=${child.parentName ?? 'null'})`);
    }
  };

  // Soft presence: only enforce attachment when objects exist in evidence.
  if (byName.has('Pip_Backpack') || byName.has('Pip_Armature') || byName.has('Pip_Character')) {
    if (byName.has('Pip_Backpack')) {
      requireParented('Pip_Backpack', [/Pip_Armature/i, /Pip/i]);
    }
  }
  if (byName.has('Goat_Collar') || byName.has('Goat_Armature') || byName.has('Goat_Character')) {
    if (byName.has('Goat_Collar')) {
      requireParented('Goat_Collar', [/Goat_Armature/i, /Goat/i]);
    }
    if (byName.has('Goat_Tag')) {
      requireParented('Goat_Tag', [/Goat_Armature/i, /Goat_Collar/i, /Goat/i]);
    }
  }

  return {
    ok: issues.length === 0,
    reason: issues.length === 0 ? 'character/accessory hierarchy valid' : issues.join('; '),
    issues,
  };
}

export function evaluateSceneAssembly(assembly: SceneAssemblyEvidence): {
  ok: boolean;
  reason: string;
} {
  const missing: string[] = [];
  if (!assembly.rolesPresent.pip) missing.push('pip');
  if (!assembly.rolesPresent.goat) missing.push('goat');
  if (!assembly.rolesPresent.camera) missing.push('camera');
  if (missing.length) {
    return { ok: false, reason: `scene roles missing: ${missing.join(', ')}` };
  }
  if (!assembly.placementsAppliedToWholeAsset) {
    return {
      ok: false,
      reason: 'placements did not apply to whole multi-object assets (possible MapMark/mesh split)',
    };
  }
  if (!assembly.multiObjectAssetsIntact) {
    return { ok: false, reason: 'multi-object asset integrity failed' };
  }
  return { ok: true, reason: 'scene assembly roles and multi-object placement valid' };
}

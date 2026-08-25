import type {
  Depth,
  ProductionSemanticRole,
  QualityTier,
} from '@/lib/tivvlejoy-approved-asset-registry/types';
import { compileEp001ProductionPackage } from '@/lib/tivvlejoy-ep001-production-package';
import { sha256Canonical } from '@/lib/tivvlejoy-production-studio/hash';

export const EP001_SCENERY_PULL_SHEET_SCHEMA = 'TIVVLEJOY_EP001_SCENERY_PULL_SHEET_V1' as const;

type Ep001Package = ReturnType<typeof compileEp001ProductionPackage>;

type ProviderRequirement =
  | 'APPROVED_LIBRARY_REQUIRED'
  | 'APPROVED_LIBRARY_OR_REVIEWED_NATIVE_DERIVATIVE'
  | 'REVIEWED_NATIVE_BLENDER_ALLOWED';

type StoryPropState = {
  propId: 'STORY_MAP' | 'MAP_FRAGMENT';
  state: string;
  carrier: 'PIP' | 'NONE';
  visibility: 'HERO' | 'SUPPORTING';
  sourceState: 'UNRESOLVED_APPROVED_STORY_PROP_REQUIRED';
};

const HERO_ROLES = new Set<ProductionSemanticRole>(['BUILDING_HERO', 'TREE_HERO', 'SIGNAGE']);

const BACKGROUND_ROLES = new Set<ProductionSemanticRole>(['BACKGROUND_FILL', 'SKY']);

const APPROVED_LIBRARY_ROLES = new Set<ProductionSemanticRole>([
  'BUILDING_HERO',
  'BUILDING_SUPPORT',
  'SIGNAGE',
  'STREET_PROP',
  'TREE_HERO',
  'TREE_SUPPORT',
]);

const ROLE_REASONS: Partial<Record<ProductionSemanticRole, string>> = {
  BUILDING_HERO: 'The bakery must read as Pip and Goat’s recurring home-base landmark.',
  BUILDING_SUPPORT:
    'The side street needs real architectural depth without competing with the cast.',
  SIGNAGE: 'The bakery sign anchors the opening clue and must remain legible in the hook.',
  PATH: 'Screen-right travel and the final adventure exit require one continuous walkable route.',
  STREET_PROP:
    'Sparse village dressing sells the neighborhood without crowding character silhouettes.',
  TREE_HERO: 'The flexible branch carries the high clue and the shared physical payoff.',
  TREE_SUPPORT: 'Supporting trees establish the enchanted outskirts and frame the meadow.',
  GRASS: 'Ground cover prevents the meadow from reading as an empty plane.',
  FLOWERS: 'Flowers motivate Goat’s low search but remain supporting dressing, never a hero asset.',
  BACKGROUND_FILL: 'Distant village or meadow forms preserve depth in the 9:16 frame.',
  SKY: 'The sky supports morning, day-adventure, and golden-hour lighting continuity.',
};

const FOCAL_SCENERY_ROLES: Record<string, ProductionSemanticRole[]> = {
  EP001_SH01: ['BUILDING_HERO', 'SIGNAGE'],
  EP001_SH02: [],
  EP001_SH03: [],
  EP001_SH04: ['PATH'],
  EP001_SH05: ['PATH', 'TREE_HERO'],
  EP001_SH06: ['FLOWERS'],
  EP001_SH07: ['TREE_HERO'],
  EP001_SH08: ['TREE_HERO'],
  EP001_SH09: [],
  EP001_SH10: ['PATH'],
};

const STORY_PROP_STATES: Record<string, StoryPropState[]> = {
  EP001_SH01: [
    storyProp('STORY_MAP', 'curled and fluttering beneath the bakery sign', 'NONE', 'HERO'),
  ],
  EP001_SH02: [
    storyProp('STORY_MAP', 'open with the upper-right corner visibly missing', 'PIP', 'HERO'),
  ],
  EP001_SH03: [
    storyProp('STORY_MAP', 'held close with the torn corner unchanged', 'PIP', 'SUPPORTING'),
  ],
  EP001_SH04: [storyProp('STORY_MAP', 'secure while Pip points screen right', 'PIP', 'SUPPORTING')],
  EP001_SH05: [storyProp('STORY_MAP', 'secure during the run to the meadow', 'PIP', 'SUPPORTING')],
  EP001_SH06: [storyProp('STORY_MAP', 'open while Pip scans the meadow', 'PIP', 'SUPPORTING')],
  EP001_SH07: [
    storyProp('STORY_MAP', 'open with its missing corner readable', 'PIP', 'SUPPORTING'),
    storyProp('MAP_FRAGMENT', 'caught on the flexible branch above Goat', 'NONE', 'HERO'),
  ],
  EP001_SH08: [
    storyProp('STORY_MAP', 'held securely during the shared reach', 'PIP', 'SUPPORTING'),
    storyProp('MAP_FRAGMENT', 'retrieved from the lowered branch', 'PIP', 'HERO'),
  ],
  EP001_SH09: [
    storyProp('STORY_MAP', 'open as the corner aligns and a new path draws itself', 'PIP', 'HERO'),
    storyProp('MAP_FRAGMENT', 'aligned to the upper-right torn edge', 'PIP', 'HERO'),
  ],
  EP001_SH10: [
    storyProp(
      'STORY_MAP',
      'repaired, folded, and carried into the next episode',
      'PIP',
      'SUPPORTING',
    ),
  ],
};

const QUALITY_GATES = [
  ['SCENERY_GATE_01', 'Focal scenery is readable at 1080 × 1920.'],
  ['SCENERY_GATE_02', 'Pip and Goat faces and silhouettes remain unobstructed.'],
  ['SCENERY_GATE_03', 'The story map and fragment remain readable in every required shot.'],
  ['SCENERY_GATE_04', 'The bottom 18 percent stays safe for captions.'],
  ['SCENERY_GATE_05', 'Foreground, midground, and background create clear 9:16 depth.'],
  ['SCENERY_GATE_06', 'Imported materials are harmonized to the TivvleJoy storybook palette.'],
  ['SCENERY_GATE_07', 'Paths, scale, and clearances support both character rigs.'],
  ['SCENERY_GATE_08', 'Dressing avoids clutter, obvious duplication, and repeated silhouettes.'],
  ['SCENERY_GATE_09', 'Morning, day, and golden-hour changes preserve location continuity.'],
  ['SCENERY_GATE_10', 'Every selected source has immutable provenance and approval receipts.'],
] as const;

function storyProp(
  propId: StoryPropState['propId'],
  state: string,
  carrier: StoryPropState['carrier'],
  visibility: StoryPropState['visibility'],
): StoryPropState {
  return {
    propId,
    state,
    carrier,
    visibility,
    sourceState: 'UNRESOLVED_APPROVED_STORY_PROP_REQUIRED',
  };
}

function qualityTierForRole(role: ProductionSemanticRole): QualityTier {
  if (HERO_ROLES.has(role)) return 'HERO';
  if (BACKGROUND_ROLES.has(role)) return 'BACKGROUND';
  return 'SUPPORTING';
}

function depthForRole(role: ProductionSemanticRole): Depth {
  if (BACKGROUND_ROLES.has(role)) return 'BACKGROUND';
  if (role === 'FLOWERS' || role === 'GRASS' || role === 'STREET_PROP') return 'FOREGROUND';
  return 'MIDGROUND';
}

function providerRequirementForRole(role: ProductionSemanticRole): ProviderRequirement {
  if (APPROVED_LIBRARY_ROLES.has(role)) return 'APPROVED_LIBRARY_REQUIRED';
  if (role === 'SKY') return 'REVIEWED_NATIVE_BLENDER_ALLOWED';
  return 'APPROVED_LIBRARY_OR_REVIEWED_NATIVE_DERIVATIVE';
}

function compileLocationRole(locationId: string, role: ProductionSemanticRole) {
  return {
    slotId: `EP001_${locationId.toUpperCase()}_${role}`,
    semanticRole: role,
    qualityTier: qualityTierForRole(role),
    depth: depthForRole(role),
    providerRequirement: providerRequirementForRole(role),
    reason: ROLE_REASONS[role] ?? `Episode 1 requires ${role} for location continuity.`,
    resolutionState: 'UNRESOLVED_APPROVED_BINDING_REQUIRED' as const,
    selectedAssetId: null,
    selectedAssetVersion: null,
    sourceSha256: null,
    approvalReceiptRef: null,
  };
}

export function compileEp001SceneryPullSheet(
  episode: Ep001Package = compileEp001ProductionPackage(),
) {
  if (episode.episodeId !== 'EP001') throw new Error('EP001_SCENERY_PULL_SHEET_WRONG_EPISODE');

  const locations = episode.sceneryBindings.map((binding) => {
    const shotIds = episode.shots
      .filter((shot) => shot.locationId === binding.locationId)
      .map((shot) => shot.shotId);
    const requiredRoles = binding.requiredRoles.map((role) =>
      compileLocationRole(binding.locationId, role),
    );
    const baseBody = {
      locationId: binding.locationId,
      worldNode: binding.worldNode,
      archetypeId: binding.archetypeId,
      requiredRoles: requiredRoles.map((role) => role.semanticRole),
    };

    return {
      ...baseBody,
      shotIds,
      baseLoadCount: 1 as const,
      reusedShotCount: Math.max(0, shotIds.length - 1),
      requiredRoles,
      bindingState: 'UNRESOLVED_APPROVED_ASSETS_REQUIRED' as const,
      baseLocationSha256: sha256Canonical(baseBody),
    };
  });

  const shots = episode.shots.map((shot) => {
    const location = locations.find((candidate) => candidate.locationId === shot.locationId);
    if (!location) throw new Error(`EP001_SCENERY_PULL_SHEET_LOCATION_MISSING:${shot.shotId}`);
    const focalRoles = new Set(FOCAL_SCENERY_ROLES[shot.shotId] ?? []);
    const storyProps = STORY_PROP_STATES[shot.shotId];
    if (!storyProps) throw new Error(`EP001_SCENERY_PULL_SHEET_PROP_STATE_MISSING:${shot.shotId}`);

    const roleVisibility = location.requiredRoles.map((role) => ({
      slotId: role.slotId,
      semanticRole: role.semanticRole,
      qualityTier: role.qualityTier,
      visibilityPriority: focalRoles.has(role.semanticRole)
        ? ('STORY_READABLE' as const)
        : role.qualityTier === 'BACKGROUND'
          ? ('BACKGROUND_DEPTH' as const)
          : ('SUPPORTING_READABLE' as const),
      cullAllowed: role.qualityTier === 'BACKGROUND' && !focalRoles.has(role.semanticRole),
    }));
    const firstLocationShotId = location.shotIds[0]!;

    return {
      shotId: shot.shotId,
      beat: shot.beat,
      storyPurpose: shot.storyPurpose,
      locationId: shot.locationId,
      archetypeId: shot.archetypeId,
      cameraTemplateId: shot.cameraTemplateId,
      cameraMotion: shot.cameraMotion,
      focalTarget: shot.focalTarget,
      lightingPresetId: shot.lightingPresetId,
      lightingIntent: shot.lightingIntent,
      roleVisibility,
      storyProps,
      compositionProtections: [
        `${shot.focalTarget} remains unobstructed.`,
        `${shot.charactersVisible.join(' and ')} faces and silhouettes remain readable.`,
        'Bottom 18 percent remains caption-safe.',
        ...shot.continuity,
      ],
      locationReuse: {
        firstLocationShotId,
        reusesBaseLocation: shot.shotId !== firstLocationShotId,
        baseLocationSha256: location.baseLocationSha256,
      },
      sourceBindingsResolved: false as const,
      visualApprovalIssued: false as const,
      assemblyAllowed: false as const,
    };
  });

  const uniqueRoles = new Set(
    locations.flatMap((location) => location.requiredRoles.map((role) => role.semanticRole)),
  );
  const storyPropIds = new Set(shots.flatMap((shot) => shot.storyProps.map((prop) => prop.propId)));
  const qualityGates = QUALITY_GATES.map(([id, label]) => ({
    id,
    label,
    status: 'PENDING_REAL_ASSET_BINDING_AND_VISUAL_REVIEW' as const,
    complete: false as const,
    autoApproval: false as const,
  }));
  const body = {
    schemaVersion: EP001_SCENERY_PULL_SHEET_SCHEMA,
    episodeId: episode.episodeId,
    workingTitle: episode.workingTitle,
    productionPackageSha256: episode.packageSha256,
    state: 'LOGICAL_PULL_SHEET_READY_ASSETS_UNRESOLVED' as const,
    locations,
    shots,
    metrics: {
      locationCount: locations.length,
      shotCount: shots.length,
      uniqueRequiredRoleCount: uniqueRoles.size,
      storyPropCount: storyPropIds.size,
      baseLocationLoadCount: locations.length,
      reusedEnvironmentInstanceCount: shots.length - locations.length,
      estimatedBaseReusePercent: Math.round(
        ((shots.length - locations.length) / shots.length) * 100,
      ),
      qualityGateCount: qualityGates.length,
    },
    qualityGates,
    authority: {
      approvedAssetBindingsIssued: false as const,
      sceneryVisualApprovalIssued: false as const,
      shotAssemblyAllowed: false as const,
      blenderExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      logicalRequirementsOnly: true as const,
      commercialSourceBytesRead: 0 as const,
      networkCalls: 0 as const,
      storageMutations: 0 as const,
      blenderExecuted: false as const,
    },
  };

  return { ...body, pullSheetSha256: sha256Canonical(body) };
}

export type Ep001SceneryPullSheet = ReturnType<typeof compileEp001SceneryPullSheet>;

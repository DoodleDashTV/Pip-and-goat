/**
 * Reusable environment, prop, lighting and VFX planning libraries.
 *
 * Planning only. Nothing here writes a .blend, a texture, or a production-library
 * path. Existing direction lighting recipes and VFX registry ids are referenced,
 * not replaced. Character assets are out of scope.
 */
import { z } from 'zod';
import { stableHash } from '@doodle-dash/direction';
import { PlanIssueSchema, type PlanIssue } from '../schema';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import type { StoryDraft } from '../story';

export const EnvironmentRecipeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.literal('ENVIRONMENT'),
  productionLibraryPath: z.undefined().optional(),
  reusable: z.literal(true),
  notes: z.string(),
});
export type EnvironmentRecipe = z.infer<typeof EnvironmentRecipeSchema>;

export const PropRecipeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.literal('PROP'),
  reusable: z.literal(true),
  notes: z.string(),
});
export type PropRecipe = z.infer<typeof PropRecipeSchema>;

export const ENVIRONMENT_LIBRARY: readonly EnvironmentRecipe[] = [
  {
    id: 'env_meadow_edge_v1',
    label: 'Meadow edge',
    kind: 'ENVIRONMENT',
    reusable: true,
    notes: 'Open grass and a tree line. Planning recipe only; does not replace the accepted meadow blend.',
  },
  {
    id: 'env_meadow_path_v1',
    label: 'Meadow path',
    kind: 'ENVIRONMENT',
    reusable: true,
    notes: 'Trail between blockers. Reuses the accepted meadow lighting language.',
  },
  {
    id: 'env_creek_bank_v1',
    label: 'Creek bank',
    kind: 'ENVIRONMENT',
    reusable: true,
    notes: 'Shallow water edge. No new character geo.',
  },
  {
    id: 'env_meadow_clearing_v1',
    label: 'Meadow clearing',
    kind: 'ENVIRONMENT',
    reusable: true,
    notes: 'Payoff space with sky headroom for 9:16.',
  },
];

export const PROP_LIBRARY: readonly PropRecipe[] = [
  {
    id: 'prop_adventure_map_v1',
    label: 'Adventure map (planning stand-in)',
    kind: 'PROP',
    reusable: true,
    notes: 'References the accepted AdventureMap prop. Does not rebuild or replace it.',
  },
];

export const LIGHTING_RECIPE_REFS = [
  'MEADOW_DAY_KEY',
  'MEADOW_DAY_SOFT',
  'DISCOVERY_GOLDEN',
  'GENTLE_OVERCAST',
] as const;

export const VFX_RECIPE_REFS = [
  'vfx_magic_sparkles_v1',
  'vfx_glow_trail_v1',
  'vfx_dust_puff_v1',
  'vfx_leaves_wind_v1',
  'vfx_map_glow_v1',
  'vfx_soft_mist_v1',
  'vfx_water_splash_v1',
  'vfx_discovery_burst_v1',
  'vfx_environment_particles_v1',
  'vfx_transition_accent_v1',
] as const;

export const LibraryBindingSchema = z.object({
  episodeId: z.string(),
  environments: z.array(z.string()),
  props: z.array(z.string()),
  lightingRecipe: z.enum(LIGHTING_RECIPE_REFS),
  vfxIds: z.array(z.string()),
  writesProductionLibrary: z.literal(false),
  cacheKey: z.string(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.library),
});
export type LibraryBinding = z.infer<typeof LibraryBindingSchema>;

export function planLibrary(draft: StoryDraft): { library: LibraryBinding; issues: PlanIssue[] } {
  const issues: PlanIssue[] = [];
  const environments = [...new Set(draft.beats.map((beat) => beat.locationId))];
  const props = [...new Set(draft.beats.flatMap((beat) => beat.requiredProps))];
  const vfxIds = [...new Set(draft.beats.flatMap((beat) => beat.vfxRequests))];

  for (const id of environments) {
    if (!ENVIRONMENT_LIBRARY.some((recipe) => recipe.id === id)) {
      issues.push({
        code: 'LIBRARY_UNKNOWN_ENVIRONMENT',
        severity: 'ERROR',
        system: 'library',
        message: `Unknown environment recipe ${id}.`,
      });
    }
  }
  for (const id of props) {
    if (!PROP_LIBRARY.some((recipe) => recipe.id === id)) {
      issues.push({
        code: 'LIBRARY_UNKNOWN_PROP',
        severity: 'ERROR',
        system: 'library',
        message: `Unknown prop recipe ${id}.`,
      });
    }
  }
  for (const id of vfxIds) {
    if (!VFX_RECIPE_REFS.includes(id as (typeof VFX_RECIPE_REFS)[number])) {
      issues.push({
        code: 'LIBRARY_UNKNOWN_VFX',
        severity: 'ERROR',
        system: 'library',
        message: `VFX ${id} is not in the existing direction registry.`,
      });
    }
  }

  const lightingRecipe =
    draft.beats.some((beat) => beat.purpose === 'DISCOVERY') ? 'DISCOVERY_GOLDEN' : 'MEADOW_DAY_KEY';

  const library = LibraryBindingSchema.parse({
    episodeId: draft.episodeId,
    environments,
    props,
    lightingRecipe,
    vfxIds,
    writesProductionLibrary: false,
    cacheKey: '',
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.library,
  });
  library.cacheKey = stableHash({
    version: library.version,
    environments,
    props,
    lightingRecipe,
    vfxIds,
  });

  return { library, issues: issues.map((issue) => PlanIssueSchema.parse(issue)) };
}

/** Planning-only reusable specs. Never writes production-library. */
export function specifyReusableLibrary(draft: StoryDraft) {
  const planned = planLibrary(draft);
  return {
    ...planned.library,
    specifications: {
      environments: planned.library.environments.map((id) => ({
        id,
        kind: 'ENVIRONMENT' as const,
        writesProductionLibrary: false as const,
      })),
      props: planned.library.props.map((id) => ({
        id,
        kind: 'PROP' as const,
        writesProductionLibrary: false as const,
      })),
      lighting: { recipe: planned.library.lightingRecipe, writesProductionLibrary: false as const },
      vfx: planned.library.vfxIds.map((id) => ({ id, writesProductionLibrary: false as const })),
    },
    writesProductionLibrary: false as const,
    issues: planned.issues,
  };
}

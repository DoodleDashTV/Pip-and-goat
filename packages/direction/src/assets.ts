/**
 * Versioned asset bindings.
 *
 * A shot used to say it needed `"pip"`. That string is a whole set of decisions
 * collapsed into one word: which mesh, which rig, which groom, which shader
 * build, which texture set, which LOD. While there is exactly one Pip it reads as
 * sufficient; the moment there are two — the prototype kept for regression and the
 * theatrical rebuild — it becomes ambiguous in the worst possible way, because
 * every cache key that hashed `"pip"` matches both.
 *
 * An `AssetBinding` names the pieces explicitly and immutably. Swapping Pip's
 * mesh from v1 to v2 changes the binding, which changes the shot cache key, which
 * re-renders exactly the shots Pip appears in and nothing else. Rolling back is
 * pinning the previous binding. Both properties come from the same place: the
 * binding is data, and it is hashed.
 *
 * `requiredAssets` is unchanged and still carries the logical ids, so every
 * existing consumer and every stored blueprint keeps working.
 */
import { z } from 'zod';
import { CharacterCodeSchema, NonEmptyStringSchema, type CharacterCode } from './schema/common';
import { QualityTierSchema, type QualityTier } from './quality';
import { DEFAULT_RIG_BY_CHARACTER } from './rig';
import { stableHash } from './determinism';

export const ASSET_KINDS = ['CHARACTER', 'ENVIRONMENT', 'PROP', 'VFX_PRESET', 'LIGHTING_RIG'] as const;
export const AssetKindSchema = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof AssetKindSchema>;

/**
 * LOD selection policy.
 *
 * `AUTO_BY_TIER` is the only one a planner should normally emit: DRAFT takes the
 * cheap LOD, FINAL takes the hero one. Pinning a specific LOD is for reproducing
 * a historical render exactly.
 */
export const LOD_POLICIES = ['AUTO_BY_TIER', 'PIN_HERO', 'PIN_MID', 'PIN_LOW'] as const;
export const LodPolicySchema = z.enum(LOD_POLICIES);
export type LodPolicy = z.infer<typeof LodPolicySchema>;

/**
 * The implementation pieces of one asset, each independently versioned.
 *
 * Optional where the prototype assets genuinely have nothing: there is no groom
 * on a prototype chick, and saying `groomVersion: '0'` would be a lie that a
 * future planner would believe. Absent means absent.
 */
export const AssetComponentVersionsSchema = z.object({
  /** Mesh/sculpt version. Bumping it is a new silhouette. */
  meshVersion: NonEmptyStringSchema,
  /** Rig id from the rig registry, and its version. */
  rigId: z.string().optional(),
  rigVersion: z.string().optional(),
  /** Groom (fur/feather) system version. Absent when the asset has no groom. */
  groomVersion: z.string().optional(),
  /** Shader/material build version. */
  shaderVersion: z.string().optional(),
  /** Texture set id and its resolution class, e.g. `pip_pbr_4k`. */
  textureSetId: z.string().optional(),
  textureResolution: z.enum(['1K', '2K', '4K', '8K']).optional(),
  /** Corrective shape-key set version, when the rig has correctives. */
  correctiveSetVersion: z.string().optional(),
  /** Simulation/cloth setup version, when the asset simulates. */
  simulationSetupVersion: z.string().optional(),
});
export type AssetComponentVersions = z.infer<typeof AssetComponentVersionsSchema>;

export const AssetBindingSchema = z.object({
  /** Logical id, stable across every version. `pip` is always `pip`. */
  logicalId: NonEmptyStringSchema,
  kind: AssetKindSchema,
  /** Set for CHARACTER bindings; the canon identity this asset implements. */
  characterCode: CharacterCodeSchema.optional(),
  /** Bumped when any component below changes. The thing to pin and roll back to. */
  assetVersion: NonEmptyStringSchema,
  quality: QualityTierSchema,
  components: AssetComponentVersionsSchema,
  lodPolicy: LodPolicySchema.default('AUTO_BY_TIER'),
  /** LODs the asset actually ships. Prototype assets ship one. */
  availableLods: z.array(z.enum(['HERO', 'MID', 'LOW'])).min(1),
  /** Source path under the approved library. Read-only to this package. */
  sourcePath: z.string(),
  /**
   * Fingerprint of the approved source, when one is published.
   *
   * For the prototype characters this is the accepted FINAL_1080P asset
   * fingerprint, which is why a change to `production-library/` invalidates
   * plans that bound it.
   */
  sourceFingerprint: z.string().optional(),
  /** Immutable once published. Editing a published asset in place is forbidden. */
  immutable: z.boolean(),
  /** The binding this one replaces, so rollback has a target. */
  supersedes: z.string().optional(),
  license: NonEmptyStringSchema,
  provenance: z.object({
    author: NonEmptyStringSchema,
    origin: NonEmptyStringSchema,
    approvedAt: z.string().optional(),
  }),
});
export type AssetBinding = z.infer<typeof AssetBindingSchema>;

const STUDIO_ASSET_PROVENANCE = {
  author: 'TivvleJoy Studios',
  origin: 'Authored in-house; no third-party character, mesh or texture imported',
} as const;

const PROPRIETARY = 'Proprietary — TivvleJoy Studios internal use';

/**
 * The prototype asset set, described exactly as it exists.
 *
 * These are the assets the accepted FINAL_1080P render used. They are functional
 * baselines: one LOD, no groom, no correctives, no simulation. Recording that
 * honestly is what makes them useful as a regression fixture and what stops
 * anyone reading the manifest as a description of theatrical quality.
 *
 * `sourceFingerprint` on the characters is the approved fingerprint from the
 * closed acceptance. It is asserted against the live library by the regression
 * suite, not recomputed here.
 */
export const PIP_PROTOTYPE_BINDING: AssetBinding = AssetBindingSchema.parse({
  logicalId: 'pip',
  kind: 'CHARACTER',
  characterCode: 'CHAR_PIP_001',
  assetVersion: 'prototype-1.1',
  quality: 'PROTOTYPE',
  components: {
    meshVersion: '1.1',
    rigId: DEFAULT_RIG_BY_CHARACTER.CHAR_PIP_001,
    rigVersion: '1.0.0',
    shaderVersion: '1.0.0',
    textureSetId: 'pip_prototype_vertex_color',
    textureResolution: '1K',
  },
  lodPolicy: 'AUTO_BY_TIER',
  availableLods: ['HERO'],
  sourcePath: 'production-library/characters/pip',
  sourceFingerprint: '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7',
  immutable: true,
  license: PROPRIETARY,
  provenance: STUDIO_ASSET_PROVENANCE,
});

export const GOAT_PROTOTYPE_BINDING: AssetBinding = AssetBindingSchema.parse({
  logicalId: 'goat',
  kind: 'CHARACTER',
  characterCode: 'CHAR_GOAT_001',
  assetVersion: 'prototype-1.1',
  quality: 'PROTOTYPE',
  components: {
    meshVersion: '1.1',
    rigId: DEFAULT_RIG_BY_CHARACTER.CHAR_GOAT_001,
    rigVersion: '1.0.0',
    shaderVersion: '1.0.0',
    textureSetId: 'goat_prototype_vertex_color',
    textureResolution: '1K',
  },
  lodPolicy: 'AUTO_BY_TIER',
  availableLods: ['HERO'],
  sourcePath: 'production-library/characters/goat',
  sourceFingerprint: '7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7',
  immutable: true,
  license: PROPRIETARY,
  provenance: STUDIO_ASSET_PROVENANCE,
});

export const MEADOW_PROTOTYPE_BINDING: AssetBinding = AssetBindingSchema.parse({
  logicalId: 'MEADOW',
  kind: 'ENVIRONMENT',
  assetVersion: 'prototype-1.0',
  quality: 'PROTOTYPE',
  components: { meshVersion: '1.0', shaderVersion: '1.0.0' },
  availableLods: ['HERO'],
  sourcePath: 'production-library/environments/meadow',
  immutable: true,
  license: PROPRIETARY,
  provenance: STUDIO_ASSET_PROVENANCE,
});

/**
 * Prop bindings.
 *
 * Props are declared per logical id used by scene plans. An unbound prop is not
 * an error — it falls back to a logical-id-only requirement, exactly as before
 * this file existed — but it is reported, because an unbound prop cannot be
 * version-pinned or rolled back.
 */
export const MAP_PROTOTYPE_BINDING: AssetBinding = AssetBindingSchema.parse({
  logicalId: 'treasure_map',
  kind: 'PROP',
  assetVersion: 'prototype-1.0',
  quality: 'PROTOTYPE',
  components: { meshVersion: '1.0', shaderVersion: '1.0.0' },
  availableLods: ['HERO'],
  sourcePath: 'production-library/props/treasure_map',
  immutable: true,
  license: PROPRIETARY,
  provenance: STUDIO_ASSET_PROVENANCE,
});

/**
 * The binding registry, keyed by `logicalId@assetVersion`.
 *
 * Append-only. A theatrical Pip is a new key, not an edit: the prototype key must
 * keep resolving forever or the stored blueprints that reference it become
 * unreadable and the regression fixtures stop being fixtures.
 */
export const ASSET_BINDINGS: Readonly<Record<string, AssetBinding>> = Object.freeze(
  Object.fromEntries(
    [PIP_PROTOTYPE_BINDING, GOAT_PROTOTYPE_BINDING, MEADOW_PROTOTYPE_BINDING, MAP_PROTOTYPE_BINDING].map(
      (binding) => [bindingKey(binding), binding],
    ),
  ),
);

export function bindingKey(binding: Pick<AssetBinding, 'logicalId' | 'assetVersion'>): string {
  return `${binding.logicalId}@${binding.assetVersion}`;
}

/**
 * Which binding a character resolves to at a given quality tier.
 *
 * Fails closed rather than silently substituting a prototype for a theatrical
 * request. Asking for theatrical Pip before theatrical Pip exists must be an
 * error a planner reports, not a prototype render that looks like an answer.
 */
export function resolveCharacterBinding(characterCode: CharacterCode, quality: QualityTier): AssetBinding {
  const match = Object.values(ASSET_BINDINGS).find(
    (binding) => binding.characterCode === characterCode && binding.quality === quality,
  );
  if (!match) {
    const available = Object.values(ASSET_BINDINGS)
      .filter((binding) => binding.characterCode === characterCode)
      .map((binding) => `${bindingKey(binding)} (${binding.quality})`)
      .sort();
    throw new Error(
      `No ${quality} asset binding for ${characterCode}. Available: ${available.join(', ') || 'none'}. ` +
        'Theatrical bindings are published by the Theatrical CGI Asset Foundation tranche.',
    );
  }
  return match;
}

/** Binding for a non-character logical id, or undefined when unbound. */
export function findBinding(logicalId: string, quality: QualityTier): AssetBinding | undefined {
  return Object.values(ASSET_BINDINGS).find(
    (binding) => binding.logicalId === logicalId && binding.quality === quality,
  );
}

/**
 * The LOD a binding should render at, given the render tier.
 *
 * Degrades to the best available rather than failing: a prototype asset that
 * ships only `HERO` renders `HERO` at DRAFT, which is correct — there is nothing
 * cheaper to reach for.
 */
export function resolveLod(binding: AssetBinding, tier: 'DRAFT' | 'REVIEW' | 'FINAL'): 'HERO' | 'MID' | 'LOW' {
  if (binding.lodPolicy === 'PIN_HERO') return 'HERO';
  if (binding.lodPolicy === 'PIN_MID') return binding.availableLods.includes('MID') ? 'MID' : 'HERO';
  if (binding.lodPolicy === 'PIN_LOW') return binding.availableLods.includes('LOW') ? 'LOW' : 'HERO';
  const preference =
    tier === 'FINAL' ? (['HERO', 'MID', 'LOW'] as const) : tier === 'REVIEW' ? (['MID', 'HERO', 'LOW'] as const) : (['LOW', 'MID', 'HERO'] as const);
  return preference.find((lod) => binding.availableLods.includes(lod)) ?? 'HERO';
}

/**
 * The part of a binding that affects pixels, for the shot cache key.
 *
 * An explicit projection, matching the style of `shotCacheInputs`: adding a
 * provenance field must not invalidate every cached shot, and adding a mesh
 * version field must.
 */
export function bindingCacheInputs(binding: AssetBinding, lod: string): Record<string, unknown> {
  return {
    logicalId: binding.logicalId,
    assetVersion: binding.assetVersion,
    quality: binding.quality,
    components: binding.components,
    lod,
    sourceFingerprint: binding.sourceFingerprint ?? null,
  };
}

export const ShotAssetBindingSchema = z.object({
  logicalId: NonEmptyStringSchema,
  kind: AssetKindSchema,
  characterCode: CharacterCodeSchema.optional(),
  assetVersion: NonEmptyStringSchema,
  quality: QualityTierSchema,
  components: AssetComponentVersionsSchema,
  /** LOD resolved for this shot's render tier. */
  lod: z.enum(['HERO', 'MID', 'LOW']),
  sourceFingerprint: z.string().optional(),
  /** Hash of the pixel-affecting parts, contributing to the shot cache key. */
  cacheKey: NonEmptyStringSchema,
});
export type ShotAssetBinding = z.infer<typeof ShotAssetBindingSchema>;

export function projectShotBinding(binding: AssetBinding, tier: 'DRAFT' | 'REVIEW' | 'FINAL'): ShotAssetBinding {
  const lod = resolveLod(binding, tier);
  return ShotAssetBindingSchema.parse({
    logicalId: binding.logicalId,
    kind: binding.kind,
    characterCode: binding.characterCode,
    assetVersion: binding.assetVersion,
    quality: binding.quality,
    components: binding.components,
    lod,
    sourceFingerprint: binding.sourceFingerprint,
    cacheKey: stableHash(bindingCacheInputs(binding, lod)),
  });
}

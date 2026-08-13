/**
 * Centralised brand configuration.
 *
 * The studio's product-facing name is TivvleJoy Studios. Internally it is still
 * DDP — "Doodle Dash Production" — and that is deliberate, not leftover. The
 * internal name appears in database rows, storage paths, environment variables,
 * API contracts and historical render manifests, and every one of those is a place
 * where renaming buys nothing and risks orphaning accepted evidence. A scattered
 * find-and-replace across them would be the single most effective way to break a
 * closed acceptance.
 *
 * So the transition is a presentation-layer change with a resolver, not a rename:
 *
 * - `STUDIO_DISPLAY_NAME` is what a human reads. Use it in UI and prose.
 * - `INTERNAL_BRAND_NAME` is what gets persisted and compared. Leave it alone.
 * - `resolveStudioDisplayName()` maps whatever is stored — including every legacy
 *   spelling — onto the current display name, so old rows render as the new brand
 *   without anyone having to migrate them.
 *
 * Adding a future brand name means adding one entry to `LEGACY_BRAND_ALIASES` and
 * changing `STUDIO_DISPLAY_NAME`. Nothing else.
 */

/** Product-facing studio name. This is the only name a user should ever see. */
export const STUDIO_DISPLAY_NAME = 'TivvleJoy Studios' as const;

/** Short form, for tight mobile headers where the full name will not fit. */
export const STUDIO_SHORT_NAME = 'TivvleJoy' as const;

/**
 * The internal brand identifier, persisted in `universe.brandName` and asserted by
 * existing tests. Intentionally unchanged — see the module comment.
 */
export const INTERNAL_BRAND_NAME = 'Doodle Dash Production' as const;

/** Internal abbreviation used in identifiers, env vars and artifact paths. */
export const INTERNAL_BRAND_ABBREVIATION = 'DDP' as const;

/**
 * The broadcast channel. Explicitly **not** rebranded: it is a separate property
 * from the studio that makes the shows, and it is what the audience subscribes to.
 */
export const CHANNEL_DISPLAY_NAME = 'Doodle Dash TV' as const;

/** The in-fiction universe. Show canon, not studio branding, so it does not move. */
export const UNIVERSE_CANON_NAME = 'Doodle Dash Universe' as const;

/**
 * Every brand name that has ever been persisted, newest first.
 *
 * A stored value matching any of these is a recognised project rather than a
 * corrupt one, which is what lets legacy projects and historical manifests keep
 * loading after the rebrand.
 */
export const LEGACY_BRAND_ALIASES = [
  STUDIO_DISPLAY_NAME,
  INTERNAL_BRAND_NAME,
  'Doodle Dash',
  'DoodleDash Production',
  INTERNAL_BRAND_ABBREVIATION,
] as const;

/** True when `name` is a brand name this studio has used at some point. */
export function isKnownBrandName(name: string): boolean {
  const needle = name.trim().toLowerCase();
  return LEGACY_BRAND_ALIASES.some((alias) => alias.toLowerCase() === needle);
}

/**
 * The name to show a human for a stored brand value.
 *
 * Any recognised legacy spelling resolves to the current display name, so a row
 * written before the rebrand presents as TivvleJoy Studios without being rewritten.
 * An unrecognised value is passed through untouched: if someone deliberately named
 * their universe something else, that is their name and not ours to overwrite.
 */
export function resolveStudioDisplayName(storedBrandName?: string | null): string {
  if (!storedBrandName || storedBrandName.trim() === '') return STUDIO_DISPLAY_NAME;
  return isKnownBrandName(storedBrandName) ? STUDIO_DISPLAY_NAME : storedBrandName;
}

/** Brand metadata for artifacts and exports: shows both names, so provenance is legible. */
export const BRAND_PROVENANCE = {
  studio: STUDIO_DISPLAY_NAME,
  channel: CHANNEL_DISPLAY_NAME,
  internalBrand: INTERNAL_BRAND_NAME,
  internalAbbreviation: INTERNAL_BRAND_ABBREVIATION,
} as const;

/**
 * Internal DDP names that stay as they are, and why.
 *
 * Kept in code rather than only in prose so that the reasoning is available at the
 * point of temptation, and so a test can assert the list has not quietly shrunk.
 */
export const PRESERVED_INTERNAL_DDP_NAMES: ReadonlyArray<{ name: string; reason: string }> = [
  { name: 'Doodle Dash Production', reason: 'persisted in universe.brandName on existing rows and asserted by existing tests' },
  { name: 'Doodle Dash Universe', reason: 'in-fiction show canon, seeded and referenced by canon facts' },
  { name: 'Doodle Dash TV', reason: 'the channel is a separate property and was explicitly excluded from the rebrand' },
  { name: 'Doodle Dash Shorts', reason: 'a delivery format profile matched by name in readiness and cost planning' },
  { name: 'DDP', reason: 'appears in env vars, storage prefixes, worker image tags and artifact paths' },
  { name: 'DDP_ShadowShrink', reason: 'vertex group baked into the approved character assets by the chest-seam repair' },
  { name: '@doodle-dash/*', reason: 'workspace package names; renaming would churn every import for no user-visible gain' },
  { name: 'ddp-runpod-blender', reason: 'published worker image name, pinned by digest in closed acceptance evidence' },
  { name: 'ddp-scene-plan-v1 / ddp-production-blueprint-v1', reason: 'schema version strings that participate in cache keys and migrations' },
];

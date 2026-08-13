/**
 * Blueprint schema migrations.
 *
 * There is one version today, so the registry is empty — but the machinery is
 * here, tested, and used by the loader, because the alternative is discovering at
 * v2 that a year of stored blueprints cannot be read. A migration is a pure
 * function from one version's shape to the next; `upgradeBlueprint()` walks them
 * in order and refuses anything it cannot place.
 */
import { BLUEPRINT_SCHEMA_HISTORY, BLUEPRINT_SCHEMA_VERSION } from '../versions';
import { ProductionBlueprintSchema, type ProductionBlueprint } from './blueprint';

export type BlueprintMigration = {
  readonly from: string;
  readonly to: string;
  readonly describe: string;
  readonly migrate: (input: Record<string, unknown>) => Record<string, unknown>;
};

/** Ordered oldest → newest. Append only; never edit a shipped migration. */
export const BLUEPRINT_MIGRATIONS: readonly BlueprintMigration[] = [];

export type UpgradeResult = {
  readonly blueprint: ProductionBlueprint;
  readonly applied: readonly string[];
  readonly fromVersion: string;
};

/**
 * Read a stored blueprint of any known version and return it at the current one.
 *
 * Fails closed on an unknown version rather than guessing: a blueprint we cannot
 * interpret must not become a render.
 */
export function upgradeBlueprint(stored: unknown): UpgradeResult {
  if (stored === null || typeof stored !== 'object') {
    throw new Error('Stored blueprint is not an object.');
  }
  const record = stored as Record<string, unknown>;
  const content = record.content;
  if (content === null || typeof content !== 'object') {
    throw new Error('Stored blueprint has no content object.');
  }
  const version = (content as Record<string, unknown>).schemaVersion;
  if (typeof version !== 'string') {
    throw new Error('Stored blueprint content has no schemaVersion.');
  }
  if (!(BLUEPRINT_SCHEMA_HISTORY as readonly string[]).includes(version)) {
    throw new Error(
      `Unknown blueprint schemaVersion "${version}"; known versions are ${BLUEPRINT_SCHEMA_HISTORY.join(', ')}.`,
    );
  }

  let current = record;
  let cursor = version;
  const applied: string[] = [];
  while (cursor !== BLUEPRINT_SCHEMA_VERSION) {
    const migration = BLUEPRINT_MIGRATIONS.find((candidate) => candidate.from === cursor);
    if (!migration) {
      throw new Error(`No migration path from blueprint schema "${cursor}" to "${BLUEPRINT_SCHEMA_VERSION}".`);
    }
    current = migration.migrate(current);
    applied.push(`${migration.from} → ${migration.to}: ${migration.describe}`);
    cursor = migration.to;
  }

  return { blueprint: ProductionBlueprintSchema.parse(current), applied, fromVersion: version };
}

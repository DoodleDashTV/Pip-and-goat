export const TIVVLEJOY_DURABLE_PRISMA_MODELS = [
  'TivvleJoyDurableWorkspace',
  'TivvleJoyDurableRecord',
  'TivvleJoyDurableEvent',
  'TivvleJoyDurableSnapshot',
] as const;

export const TIVVLEJOY_DURABLE_MIGRATION_NAME =
  '20260820010000_tivvlejoy_durable_production_persistence';

export const TIVVLEJOY_DURABLE_TABLES = [
  'tivvlejoy_durable_workspaces',
  'tivvlejoy_durable_records',
  'tivvlejoy_durable_events',
  'tivvlejoy_durable_snapshots',
] as const;

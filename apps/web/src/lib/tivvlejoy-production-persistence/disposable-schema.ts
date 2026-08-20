import { sha256Canonical } from './hash';
import { TIVVLEJOY_DURABLE_TABLES } from './prisma-models';
import type { DurableWorkspaceView, JournalEvent, DurableRecord, ProductionSnapshot } from './types';

export type DisposableDurableTables = {
  workspaces: Map<string, Record<string, unknown>>;
  records: Map<string, DurableRecord>;
  events: Map<string, JournalEvent>;
  snapshots: Map<string, ProductionSnapshot>;
};

export function createDisposableDurableTables(): DisposableDurableTables {
  return {
    workspaces: new Map(),
    records: new Map(),
    events: new Map(),
    snapshots: new Map(),
  };
}

export function durableTableNames(): readonly string[] {
  return TIVVLEJOY_DURABLE_TABLES;
}

export function writeViewToDisposableTables(tables: DisposableDurableTables, view: DurableWorkspaceView): string {
  tables.workspaces.set(view.workspaceId, {
    workspaceId: view.workspaceId,
    revision: view.revision,
    snapshotSha256: view.snapshotSha256,
    journalPosition: view.journalPosition,
  });
  tables.records.clear();
  tables.events.clear();
  tables.snapshots.clear();
  for (const record of view.records) {
    tables.records.set(`${record.entityType}::${record.entityId}`, record);
  }
  for (const event of view.events) {
    tables.events.set(event.eventId, event);
  }
  tables.snapshots.set(`${view.workspaceId}:${view.revision}`, {
    schemaVersion: 'TIVVLEJOY_PRODUCTION_SNAPSHOT_V1',
    workspaceId: view.workspaceId,
    journalPosition: view.journalPosition,
    revision: view.revision,
    snapshotSha256: view.snapshotSha256,
    records: view.records,
  });
  return sha256Canonical({
    revision: view.revision,
    records: [...tables.records.keys()].sort(),
    events: [...tables.events.keys()].sort(),
  });
}

export function readViewFromDisposableTables(tables: DisposableDurableTables, workspaceId: string): DurableWorkspaceView | null {
  const workspace = tables.workspaces.get(workspaceId);
  if (!workspace) return null;
  const records = [...tables.records.values()].sort((left, right) => left.id.localeCompare(right.id));
  const events = [...tables.events.values()].sort((left, right) => left.nextRevision - right.nextRevision);
  return {
    workspaceId,
    revision: Number(workspace.revision),
    snapshotSha256: String(workspace.snapshotSha256),
    journalPosition: Number(workspace.journalPosition),
    records,
    events,
  };
}

export function dropDisposableDurableTables(tables: DisposableDurableTables): void {
  tables.workspaces.clear();
  tables.records.clear();
  tables.events.clear();
  tables.snapshots.clear();
}

import { evaluateOptimisticWrite } from './concurrency';
import { sha256Canonical } from './hash';
import { createJournalEvent, validateJournalSequence } from './journal';
import { assertNoSecrets, sanitizeForPersistence } from './sanitizer';
import {
  PERSISTENCE_SCHEMA,
  SNAPSHOT_SCHEMA,
  type DurableRecord,
  type DurableWorkspaceView,
  type EntityType,
  type JournalEvent,
  type JournalEventType,
  type PersistenceMode,
  type ProductionSnapshot,
  type WriteReceipt,
} from './types';

export type PersistenceFault =
  | 'AFTER_EPISODE_WRITE'
  | 'BEFORE_EVENT_APPEND'
  | 'AFTER_EVENT_APPEND'
  | 'BEFORE_SNAPSHOT'
  | 'AFTER_SNAPSHOT'
  | 'MID_PACKET'
  | 'MID_QC'
  | 'MID_DELIVERY'
  | 'MID_BACKUP'
  | 'AFTER_WORKSPACE_WRITE'
  | 'BEFORE_CONTINUITY_APPEND'
  | 'AFTER_CONTINUITY_APPEND'
  | 'BEFORE_JOB_CHECKPOINT'
  | 'AFTER_JOB_CHECKPOINT'
  | 'BEFORE_QC'
  | 'AFTER_QC'
  | 'BEFORE_DELIVERY'
  | 'AFTER_DELIVERY'
  | 'BEFORE_BACKUP'
  | 'AFTER_BACKUP'
  | 'MID_SHOT_WRITE'
  | 'MID_JOB_WRITE'
  | 'BEFORE_BATCH'
  | 'AFTER_BATCH'
  | 'MID_IMPORT'
  | 'AFTER_SCRIPT_BIND'
  | 'BEFORE_VOICE_BIND'
  | 'AFTER_VOICE_BIND';

export class PersistenceFaultError extends Error {
  constructor(public readonly fault: PersistenceFault) {
    super(`Injected persistence fault: ${fault}`);
    this.name = 'PersistenceFaultError';
  }
}

export type StoreOptions = {
  mode: PersistenceMode;
  workspaceId?: string;
  now?: () => string;
  fault?: PersistenceFault | null;
  configured?: boolean;
};

type MutableState = {
  records: Map<string, DurableRecord>;
  events: JournalEvent[];
  snapshots: ProductionSnapshot[];
  revision: number;
};

function recordKey(entityType: EntityType, entityId: string): string {
  return `${entityType}::${entityId}`;
}

export class ProductionPersistenceStore {
  readonly mode: PersistenceMode;
  readonly workspaceId: string;
  readonly durable: boolean;
  readonly connected: boolean;
  private readonly now: () => string;
  private fault: PersistenceFault | null;
  private conflicts = 0;
  private state: MutableState;

  constructor(options: StoreOptions) {
    this.mode = options.mode;
    this.workspaceId = options.workspaceId ?? 'ws_preview_season1';
    this.now = options.now ?? (() => '1970-01-01T00:00:00.000Z');
    this.fault = options.fault ?? null;
    if (options.mode === 'PRODUCTION_DATABASE') {
      this.durable = false;
      this.connected = false;
    } else if (options.mode === 'PREVIEW_DATABASE') {
      this.connected = options.configured === true;
      this.durable = this.connected;
    } else if (options.mode === 'PREVIEW_BROWSER' || options.mode === 'PREVIEW_MEMORY') {
      this.connected = true;
      this.durable = options.mode === 'PREVIEW_BROWSER';
    } else {
      this.connected = false;
      this.durable = false;
    }
    this.state = { records: new Map(), events: [], snapshots: [], revision: 0 };
  }

  setFault(fault: PersistenceFault | null): void {
    this.fault = fault;
  }

  getFaultInjection(): PersistenceFault | null {
    return this.fault;
  }

  getRevision(): number {
    return this.state.revision;
  }

  getWorkspaceId(): string {
    return this.workspaceId;
  }

  getMode(): PersistenceMode {
    return this.mode;
  }

  conflictCount(): number {
    return this.conflicts;
  }

  listRecords(): DurableRecord[] {
    return [...this.state.records.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  listEvents(): JournalEvent[] {
    return this.readEvents();
  }

  readRecord(entityType: EntityType, entityId: string): DurableRecord | null {
    return this.state.records.get(recordKey(entityType, entityId)) ?? null;
  }

  private rejectUnconfigured(): WriteReceipt | null {
    if (this.mode === 'PRODUCTION_DATABASE') {
      return {
        result: 'WRITE_REJECTED',
        revision: this.state.revision,
        dependencySha256: this.workspaceSha256(),
        reason: 'Production database is not connected',
      };
    }
    if (this.mode === 'PREVIEW_DATABASE' && !this.connected) {
      return {
        result: 'WRITE_REJECTED',
        revision: this.state.revision,
        dependencySha256: this.workspaceSha256(),
        reason: 'PREVIEW_DATABASE NOT_CONNECTED',
      };
    }
    return null;
  }

  private trip(fault: PersistenceFault): void {
    if (this.fault === fault) {
      this.fault = null;
      throw new PersistenceFaultError(fault);
    }
  }

  private cloneState(): MutableState {
    return {
      records: new Map(this.state.records),
      events: [...this.state.events],
      snapshots: [...this.state.snapshots],
      revision: this.state.revision,
    };
  }

  workspaceSha256(): string {
    return sha256Canonical({
      workspaceId: this.workspaceId,
      revision: this.state.revision,
      records: [...this.state.records.values()]
        .map((record) => ({ id: record.id, sha: record.dependencySha256, rev: record.revision }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    });
  }

  view(): DurableWorkspaceView {
    return {
      workspaceId: this.workspaceId,
      revision: this.state.revision,
      snapshotSha256: this.latestSnapshot()?.snapshotSha256 ?? this.workspaceSha256(),
      journalPosition: this.state.events.length,
      records: [...this.state.records.values()].sort((left, right) => left.id.localeCompare(right.id)),
      events: [...this.state.events],
    };
  }

  readWorkspace(): DurableRecord | null {
    return this.state.records.get(recordKey('WORKSPACE', this.workspaceId)) ?? null;
  }

  readEpisode(episodeId: string): DurableRecord | null {
    return this.state.records.get(recordKey('EPISODE', episodeId)) ?? null;
  }

  readProductionPacket(episodeId: string): DurableRecord | null {
    return this.state.records.get(recordKey('PRODUCTION_PACKET', episodeId)) ?? null;
  }

  readStateGraphSnapshot(): ProductionSnapshot | null {
    return this.latestSnapshot();
  }

  readBatchPlan(): DurableRecord | null {
    return this.state.records.get(recordKey('BATCH_PLAN', this.workspaceId)) ?? null;
  }

  readQcReceipt(episodeId: string): DurableRecord | null {
    return this.state.records.get(recordKey('QC_RECEIPT', episodeId)) ?? null;
  }

  readDeliveryPackage(episodeId: string): DurableRecord | null {
    return this.state.records.get(recordKey('DELIVERY_PACKAGE', episodeId)) ?? null;
  }

  readEvents(): JournalEvent[] {
    return [...this.state.events];
  }

  latestSnapshot(): ProductionSnapshot | null {
    return this.state.snapshots.at(-1) ?? null;
  }

  historicalSnapshots(): ProductionSnapshot[] {
    return [...this.state.snapshots];
  }

  writeRecord(
    input: {
      entityType: EntityType;
      entityId: string;
      payload: Record<string, unknown>;
      expectedRevision: number;
      eventType: JournalEventType;
      reason: string;
    },
  ): WriteReceipt {
    const blocked = this.rejectUnconfigured();
    if (blocked) return blocked;
    const sanitized = sanitizeForPersistence(input.payload);
    assertNoSecrets(sanitized, `${input.entityType} payload`);
    const nextSha = sha256Canonical({ entityType: input.entityType, entityId: input.entityId, payload: sanitized });
    const existing = this.state.records.get(recordKey(input.entityType, input.entityId));
    const currentSha = existing?.dependencySha256 ?? '';
    const result = evaluateOptimisticWrite({
      currentRevision: this.state.revision,
      expectedRevision: input.expectedRevision,
      currentSha256: currentSha,
      nextSha256: existing && currentSha === nextSha ? currentSha : `${currentSha}:${nextSha}`,
    });
    if (existing && existing.dependencySha256 === nextSha) {
      return {
        result: 'WRITE_IDEMPOTENT',
        revision: this.state.revision,
        dependencySha256: existing.dependencySha256,
        reason: 'same content hash',
      };
    }
    if (result !== 'WRITE_ACCEPTED') {
      if (result === 'WRITE_CONFLICT') this.conflicts += 1;
      return {
        result,
        revision: this.state.revision,
        dependencySha256: this.workspaceSha256(),
        reason: `optimistic write ${result}`,
      };
    }
    return this.commitAggregate({
      expectedRevision: input.expectedRevision,
      records: [
        {
          entityType: input.entityType,
          entityId: input.entityId,
          payload: sanitized,
          dependencySha256: nextSha,
        },
      ],
      eventType: input.eventType,
      reason: input.reason,
    });
  }

  commitAggregate(input: {
    expectedRevision: number;
    records: Array<{ entityType: EntityType; entityId: string; payload: Record<string, unknown>; dependencySha256: string }>;
    eventType: JournalEventType;
    reason: string;
    snapshot?: boolean;
  }): WriteReceipt {
    const blocked = this.rejectUnconfigured();
    if (blocked) return blocked;
    if (input.expectedRevision !== this.state.revision) {
      const result = input.expectedRevision < this.state.revision ? 'WRITE_CONFLICT' : 'WRITE_STALE';
      if (result === 'WRITE_CONFLICT') this.conflicts += 1;
      return {
        result,
        revision: this.state.revision,
        dependencySha256: this.workspaceSha256(),
        reason: 'aggregate revision mismatch',
      };
    }
    const pending = this.cloneState();
    try {
      for (const record of input.records) {
        if (record.entityType === 'WORKSPACE') this.trip('AFTER_WORKSPACE_WRITE');
        if (record.entityType === 'EPISODE') this.trip('AFTER_EPISODE_WRITE');
        if (record.entityType === 'PRODUCTION_PACKET') this.trip('MID_PACKET');
        if (record.entityType === 'CONTINUITY_FACT') {
          this.trip('BEFORE_CONTINUITY_APPEND');
          this.trip('AFTER_CONTINUITY_APPEND');
        }
        if (record.entityType === 'PRODUCTION_JOB') {
          this.trip('BEFORE_JOB_CHECKPOINT');
          this.trip('MID_JOB_WRITE');
          this.trip('AFTER_JOB_CHECKPOINT');
        }
        if (record.entityType === 'QC_RECEIPT') {
          this.trip('BEFORE_QC');
          this.trip('MID_QC');
          this.trip('AFTER_QC');
        }
        if (record.entityType === 'DELIVERY_PACKAGE') {
          this.trip('BEFORE_DELIVERY');
          this.trip('MID_DELIVERY');
          this.trip('AFTER_DELIVERY');
        }
        if (record.entityType === 'SHOT') this.trip('MID_SHOT_WRITE');
        if (record.entityType === 'BATCH_PLAN') {
          this.trip('BEFORE_BATCH');
          this.trip('AFTER_BATCH');
        }
        if (record.entityType === 'SCRIPT_VERSION') this.trip('AFTER_SCRIPT_BIND');
        if (record.entityType === 'VOICE_RECEIPT') {
          this.trip('BEFORE_VOICE_BIND');
          this.trip('AFTER_VOICE_BIND');
        }
        const now = this.now();
        const existing = pending.records.get(recordKey(record.entityType, record.entityId));
        pending.records.set(recordKey(record.entityType, record.entityId), {
          id: `${record.entityType}:${record.entityId}`,
          workspaceId: this.workspaceId,
          entityType: record.entityType,
          entityId: record.entityId,
          schemaVersion: PERSISTENCE_SCHEMA,
          entityVersion: '1',
          dependencySha256: record.dependencySha256,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          revision: pending.revision + 1,
          payload: sanitizeForPersistence(record.payload),
        });
      }
      this.trip('BEFORE_EVENT_APPEND');
      const event = createJournalEvent({
        workspaceId: this.workspaceId,
        entityType: input.records[0]?.entityType ?? 'WORKSPACE',
        entityId: input.records[0]?.entityId ?? this.workspaceId,
        eventType: input.eventType,
        previousRevision: pending.revision,
        nextRevision: pending.revision + 1,
        dependencySha256: input.records[0]?.dependencySha256 ?? sha256Canonical(input.records),
        payload: {
          records: input.records.map((record) => ({
            entityType: record.entityType,
            entityId: record.entityId,
            payload: record.payload,
            dependencySha256: record.dependencySha256,
          })),
        },
        reason: input.reason,
        timestamp: this.now(),
      });
      pending.events.push(event);
      pending.revision += 1;
      this.trip('AFTER_EVENT_APPEND');
      this.trip('BEFORE_SNAPSHOT');
      const snap = this.snapshotFrom(pending);
      if (input.snapshot === true) {
        pending.snapshots = [...pending.snapshots, snap].slice(-8);
      } else {
        pending.snapshots = pending.snapshots.length > 1
          ? [...pending.snapshots.slice(0, -1), snap]
          : [snap];
      }
      this.trip('AFTER_SNAPSHOT');
      this.state = pending;
      return {
        result: 'WRITE_ACCEPTED',
        revision: this.state.revision,
        dependencySha256: this.workspaceSha256(),
        reason: 'aggregate committed',
        eventId: event.eventId,
      };
    } catch (error) {
      if (error instanceof PersistenceFaultError) {
        const fail = createJournalEvent({
          workspaceId: this.workspaceId,
          entityType: 'AUDIT_EVENT',
          entityId: `fault_${error.fault}`,
          eventType: 'WRITE_FAILED',
          previousRevision: this.state.revision,
          nextRevision: this.state.revision + 1,
          dependencySha256: this.workspaceSha256(),
          payload: { fault: error.fault, incomplete: true },
          reason: `fault ${error.fault}; last valid data kept`,
          timestamp: this.now(),
        });
        this.state = {
          records: this.state.records,
          events: [...this.state.events, fail],
          snapshots: this.state.snapshots,
          revision: this.state.revision + 1,
        };
        return {
          result: 'WRITE_REJECTED',
          revision: this.state.revision,
          dependencySha256: this.workspaceSha256(),
          reason: `fault ${error.fault}; last valid revision kept`,
          eventId: fail.eventId,
        };
      }
      return {
        result: 'WRITE_REJECTED',
        revision: this.state.revision,
        dependencySha256: this.workspaceSha256(),
        reason: 'write failed',
      };
    }
  }

  writeWorkspace(payload: Record<string, unknown>, expectedRevision = this.state.revision): WriteReceipt {
    return this.writeRecord({
      entityType: 'WORKSPACE',
      entityId: this.workspaceId,
      payload,
      expectedRevision,
      eventType: 'WORKSPACE_SAVED',
      reason: 'write workspace',
    });
  }

  writeEpisode(episodeId: string, payload: Record<string, unknown>, expectedRevision = this.state.revision): WriteReceipt {
    return this.writeRecord({
      entityType: 'EPISODE',
      entityId: episodeId,
      payload,
      expectedRevision,
      eventType: 'EPISODE_CREATED',
      reason: 'write episode',
    });
  }

  writeProductionPacket(episodeId: string, payload: Record<string, unknown>, expectedRevision = this.state.revision): WriteReceipt {
    return this.writeRecord({
      entityType: 'PRODUCTION_PACKET',
      entityId: episodeId,
      payload,
      expectedRevision,
      eventType: 'PRODUCTION_PACKET_COMPILED',
      reason: 'write production packet',
    });
  }

  appendContinuityFacts(
    facts: Array<{ factId: string; payload: Record<string, unknown> }>,
    expectedRevision = this.state.revision,
  ): WriteReceipt {
    return this.commitAggregate({
      expectedRevision,
      records: facts.map((fact) => ({
        entityType: 'CONTINUITY_FACT',
        entityId: fact.factId,
        payload: fact.payload,
        dependencySha256: sha256Canonical(fact.payload),
      })),
      eventType: 'CONTINUITY_FACT_ADDED',
      reason: 'append continuity facts',
    });
  }

  writeBatchPlan(payload: Record<string, unknown>, expectedRevision = this.state.revision): WriteReceipt {
    return this.writeRecord({
      entityType: 'BATCH_PLAN',
      entityId: this.workspaceId,
      payload,
      expectedRevision,
      eventType: 'BATCH_PLAN_WRITTEN',
      reason: 'write batch plan',
    });
  }

  writeJobCheckpoint(jobId: string, payload: Record<string, unknown>, expectedRevision = this.state.revision): WriteReceipt {
    return this.writeRecord({
      entityType: 'PRODUCTION_JOB',
      entityId: jobId,
      payload,
      expectedRevision,
      eventType: 'JOB_CHECKPOINT_WRITTEN',
      reason: 'write job checkpoint',
    });
  }

  appendAuditEvent(payload: Record<string, unknown>, expectedRevision = this.state.revision): WriteReceipt {
    return this.writeRecord({
      entityType: 'AUDIT_EVENT',
      entityId: `audit_${this.state.revision + 1}`,
      payload,
      expectedRevision,
      eventType: 'WORKSPACE_SAVED',
      reason: 'append audit event',
    });
  }

  writeQcReceipt(episodeId: string, payload: Record<string, unknown>, expectedRevision = this.state.revision): WriteReceipt {
    return this.writeRecord({
      entityType: 'QC_RECEIPT',
      entityId: episodeId,
      payload,
      expectedRevision,
      eventType: 'QC_RECEIPT_RECORDED',
      reason: 'write QC receipt',
    });
  }

  writeDeliveryPackage(episodeId: string, payload: Record<string, unknown>, expectedRevision = this.state.revision): WriteReceipt {
    return this.writeRecord({
      entityType: 'DELIVERY_PACKAGE',
      entityId: episodeId,
      payload,
      expectedRevision,
      eventType: 'DELIVERY_PACKAGE_COMPILED',
      reason: 'write delivery package',
    });
  }

  writeStateGraphSnapshot(): WriteReceipt {
    return this.commitAggregate({
      expectedRevision: this.state.revision,
      records: [
        {
          entityType: 'PRODUCTION_STATE_NODE',
          entityId: 'graph_nodes',
          payload: { recordCount: this.state.records.size },
          dependencySha256: this.workspaceSha256(),
        },
      ],
      eventType: 'STATE_GRAPH_SNAPSHOTTED',
      reason: 'explicit state graph snapshot',
      snapshot: true,
    });
  }

  private snapshotFrom(state: MutableState): ProductionSnapshot {
    const records = [...state.records.values()].sort((left, right) => left.id.localeCompare(right.id));
    const body = {
      schemaVersion: SNAPSHOT_SCHEMA,
      workspaceId: this.workspaceId,
      journalPosition: state.events.length,
      revision: state.revision,
      records,
    };
    return { ...body, snapshotSha256: sha256Canonical(body) };
  }

  replaceState(view: DurableWorkspaceView): void {
    this.state = {
      records: new Map(view.records.map((record) => [recordKey(record.entityType, record.entityId), record])),
      events: [...view.events],
      snapshots: view.records.length
        ? [
            {
              schemaVersion: SNAPSHOT_SCHEMA,
              workspaceId: view.workspaceId,
              journalPosition: view.events.length,
              revision: view.revision,
              records: view.records,
              snapshotSha256: view.snapshotSha256,
            },
          ]
        : [],
      revision: view.revision,
    };
  }

  serialize(): DurableWorkspaceView {
    return this.view();
  }
}

export function replaySnapshot(snapshot: ProductionSnapshot, events: JournalEvent[]): DurableWorkspaceView | { error: string } {
  if (!snapshot.snapshotSha256 || snapshot.snapshotSha256 !== sha256Canonical({
    schemaVersion: snapshot.schemaVersion,
    workspaceId: snapshot.workspaceId,
    journalPosition: snapshot.journalPosition,
    revision: snapshot.revision,
    records: snapshot.records,
  })) {
    return { error: 'invalid snapshot' };
  }
  const sequence = validateJournalSequence(events);
  if (!sequence.ok) return { error: sequence.reason };
  if (events[0] && events[0].previousRevision !== snapshot.revision) return { error: 'missing event' };
  const records = new Map(snapshot.records.map((record) => [recordKey(record.entityType, record.entityId), structuredClone(record)]));
  let revision = snapshot.revision;
  for (const event of events) {
    if (event.payloadSha256 !== sha256Canonical(event.payload)) return { error: 'corrupted payload hash' };
    revision = event.nextRevision;
    const bundled = event.payload.records;
    const updates = Array.isArray(bundled)
      ? (bundled as Array<{ entityType: EntityType; entityId: string; payload: Record<string, unknown>; dependencySha256: string }>)
      : [{ entityType: event.entityType, entityId: event.entityId, payload: event.payload, dependencySha256: event.dependencySha256 }];
    for (const update of updates) {
      const existing = records.get(recordKey(update.entityType, update.entityId));
      records.set(recordKey(update.entityType, update.entityId), {
        id: `${update.entityType}:${update.entityId}`,
        workspaceId: snapshot.workspaceId,
        entityType: update.entityType,
        entityId: update.entityId,
        schemaVersion: PERSISTENCE_SCHEMA,
        entityVersion: existing?.entityVersion ?? '1',
        dependencySha256: update.dependencySha256,
        createdAt: existing?.createdAt ?? event.timestamp,
        updatedAt: event.timestamp,
        revision,
        payload: update.payload ?? {},
      });
    }
  }
  const list = [...records.values()].sort((left, right) => left.id.localeCompare(right.id));
  return {
    workspaceId: snapshot.workspaceId,
    revision,
    snapshotSha256: snapshot.snapshotSha256,
    journalPosition: snapshot.journalPosition + events.length,
    records: list,
    events,
  };
}

export function recordKeyOf(entityType: EntityType, entityId: string): string {
  return recordKey(entityType, entityId);
}

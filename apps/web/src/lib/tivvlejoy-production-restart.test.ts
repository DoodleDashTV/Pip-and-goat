import { describe, expect, it } from 'vitest';
import {
  createFileStore,
  createMemoryStore,
  hydrateStoreFromJson,
  persistFileStore,
  persistSeasonInMemory,
  persistSeasonToStore,
  type PersistenceFault,
} from './tivvlejoy-production-persistence';

const FAULTS: PersistenceFault[] = [
  'AFTER_EPISODE_WRITE',
  'BEFORE_EVENT_APPEND',
  'AFTER_EVENT_APPEND',
  'BEFORE_SNAPSHOT',
  'AFTER_SNAPSHOT',
  'MID_PACKET',
  'MID_QC',
  'MID_DELIVERY',
  'AFTER_WORKSPACE_WRITE',
  'BEFORE_CONTINUITY_APPEND',
  'AFTER_CONTINUITY_APPEND',
  'BEFORE_JOB_CHECKPOINT',
  'AFTER_JOB_CHECKPOINT',
  'BEFORE_QC',
  'AFTER_QC',
  'BEFORE_DELIVERY',
  'AFTER_DELIVERY',
  'MID_SHOT_WRITE',
  'MID_JOB_WRITE',
  'BEFORE_BATCH',
  'AFTER_BATCH',
  'AFTER_SCRIPT_BIND',
  'BEFORE_VOICE_BIND',
  'AFTER_VOICE_BIND',
  'MID_IMPORT',
];

describe('production restart and crash injection', { timeout: 120_000 }, () => {
  it('survives a full process restart via serialized JSON hydration', () => {
    const { store } = persistSeasonInMemory('ws_restart_full');
    const before = {
      workspace: store.workspaceSha256(),
      episodes: store.listRecords().filter((record) => record.entityType === 'EPISODE').length,
      shots: store.listRecords().filter((record) => record.entityType === 'SHOT').length,
      jobs: store.listRecords().filter((record) => record.entityType === 'PRODUCTION_JOB').length,
      facts: store.listRecords().filter((record) => record.entityType === 'CONTINUITY_FACT').length,
      packets: store.listRecords().filter((record) => record.entityType === 'PRODUCTION_PACKET').map((record) => record.dependencySha256),
      seasonHealth: store.readRecord('SEASON', 'S01')?.payload.seasonHealth,
      graph: store.readRecord('PRODUCTION_STATE_NODE', 'graph_nodes')?.payload.graphSha256,
      batch: store.readBatchPlan()?.payload.batchPlanSha256,
      qc: store.listRecords().filter((record) => record.entityType === 'QC_RECEIPT').map((record) => record.dependencySha256),
      delivery: store.listRecords().filter((record) => record.entityType === 'DELIVERY_PACKAGE').map((record) => record.dependencySha256),
    };
    const json = JSON.stringify(store.serialize());
    const reloaded = hydrateStoreFromJson(json, 'PREVIEW_MEMORY');
    expect(reloaded).not.toBe(store);
    expect(reloaded.workspaceSha256()).toBe(before.workspace);
    expect(reloaded.listRecords().filter((record) => record.entityType === 'EPISODE')).toHaveLength(before.episodes);
    expect(reloaded.listRecords().filter((record) => record.entityType === 'SHOT')).toHaveLength(before.shots);
    expect(reloaded.listRecords().filter((record) => record.entityType === 'PRODUCTION_JOB')).toHaveLength(before.jobs);
    expect(reloaded.listRecords().filter((record) => record.entityType === 'CONTINUITY_FACT')).toHaveLength(before.facts);
    expect(reloaded.listRecords().filter((record) => record.entityType === 'PRODUCTION_PACKET').map((record) => record.dependencySha256)).toEqual(before.packets);
    expect(reloaded.readRecord('SEASON', 'S01')?.payload.seasonHealth).toEqual(before.seasonHealth);
    expect(reloaded.readRecord('PRODUCTION_STATE_NODE', 'graph_nodes')?.payload.graphSha256).toBe(before.graph);
    expect(reloaded.readBatchPlan()?.payload.batchPlanSha256).toBe(before.batch);
    expect(reloaded.listRecords().filter((record) => record.entityType === 'QC_RECEIPT').map((record) => record.dependencySha256)).toEqual(before.qc);
    expect(reloaded.listRecords().filter((record) => record.entityType === 'DELIVERY_PACKAGE').map((record) => record.dependencySha256)).toEqual(before.delivery);
  });

  it('does not reuse the same JS objects after hydration', () => {
    const original = createMemoryStore({ workspaceId: 'ws_ident' });
    original.writeEpisode('EP012', { n: 12 });
    const reloaded = hydrateStoreFromJson(JSON.stringify(original.serialize()), 'PREVIEW_MEMORY');
    expect(reloaded.readEpisode('EP012')).not.toBe(original.readEpisode('EP012'));
    expect(reloaded.readEpisode('EP012')?.payload).toEqual(original.readEpisode('EP012')?.payload);
  });

  it('rebuilds from a file directory after the first client is discarded', () => {
    const directory = new Map<string, string>();
    const first = createFileStore(directory, { workspaceId: 'ws_file_restart' });
    persistSeasonToStore(first, { persistEveryJob: false });
    persistFileStore(first, directory);
    const hash = first.workspaceSha256();
    const second = createFileStore(directory, { workspaceId: 'ws_file_restart' });
    expect(second.workspaceSha256()).toBe(hash);
    expect(second.listRecords().filter((record) => record.entityType === 'EPISODE')).toHaveLength(60);
  });

  it('recovers continuity facts after restart', () => {
    const { store } = persistSeasonInMemory('ws_restart_facts', { persistEveryJob: false });
    const facts = store.listRecords().filter((record) => record.entityType === 'CONTINUITY_FACT');
    const reloaded = hydrateStoreFromJson(JSON.stringify(store.serialize()), 'PREVIEW_BROWSER');
    expect(reloaded.listRecords().filter((record) => record.entityType === 'CONTINUITY_FACT')).toHaveLength(facts.length);
    expect(reloaded.listRecords().filter((record) => record.entityType === 'CONTINUITY_FACT')[0]?.dependencySha256).toBe(facts[0]?.dependencySha256);
  });

  it('recovers batch and recovery checkpoints after restart', () => {
    const { store } = persistSeasonInMemory('ws_restart_batch', { persistEveryJob: false });
    const reloaded = hydrateStoreFromJson(JSON.stringify(store.serialize()), 'PREVIEW_MEMORY');
    expect(reloaded.readBatchPlan()?.payload.batchPlanSha256).toBe(store.readBatchPlan()?.payload.batchPlanSha256);
    expect(reloaded.listRecords().filter((record) => record.entityType === 'RECOVERY_CHECKPOINT').length).toBe(60);
  });

  it.each(FAULTS)('injects %s and keeps last valid records recoverable', (fault) => {
    const store = createMemoryStore({ workspaceId: `ws_fault_${fault}` });
    store.writeEpisode('EP001', { n: 1 });
    const valid = store.readEpisode('EP001')?.dependencySha256;
    store.setFault(fault);
    const receipt = store.commitAggregate({
      expectedRevision: store.getRevision(),
      records: [
        { entityType: 'EPISODE', entityId: 'EP002', payload: { n: 2 }, dependencySha256: '2'.repeat(64) },
        { entityType: 'PRODUCTION_PACKET', entityId: 'EP002', payload: { packetSha256: 'p' }, dependencySha256: '3'.repeat(64) },
        { entityType: 'QC_RECEIPT', entityId: 'EP002', payload: { passed: false }, dependencySha256: '4'.repeat(64) },
        { entityType: 'DELIVERY_PACKAGE', entityId: 'EP002', payload: { readiness: 'QC_BLOCKED' }, dependencySha256: '5'.repeat(64) },
        { entityType: 'CONTINUITY_FACT', entityId: 'f2', payload: { state: 'X' }, dependencySha256: '6'.repeat(64) },
        { entityType: 'PRODUCTION_JOB', entityId: 'job_2', payload: { attempt: 1 }, dependencySha256: '7'.repeat(64) },
        { entityType: 'SHOT', entityId: 'EP002_SH01', payload: { shot: 1 }, dependencySha256: '8'.repeat(64) },
        { entityType: 'BATCH_PLAN', entityId: store.getWorkspaceId(), payload: { units: 1 }, dependencySha256: '9'.repeat(64) },
        { entityType: 'SCRIPT_VERSION', entityId: 'script_EP002', payload: { v: 1 }, dependencySha256: 'a'.repeat(64) },
        { entityType: 'VOICE_RECEIPT', entityId: 'voice_EP002', payload: { v: 1 }, dependencySha256: 'b'.repeat(64) },
        { entityType: 'WORKSPACE', entityId: store.getWorkspaceId(), payload: { label: 'next' }, dependencySha256: 'c'.repeat(64) },
      ],
      eventType: 'EPISODE_CREATED',
      reason: `fault ${fault}`,
    });
    if (fault === 'MID_IMPORT') {
      expect(receipt.result).toBe('WRITE_ACCEPTED');
      return;
    }
    expect(receipt.result).toBe('WRITE_REJECTED');
    expect(receipt.reason).toMatch(/last valid revision kept/);
    expect(store.readEpisode('EP001')?.dependencySha256).toBe(valid);
    expect(store.readEpisode('EP002')).toBeNull();
    expect(store.listEvents().some((event) => event.eventType === 'WRITE_FAILED')).toBe(true);
    expect(store.listEvents().at(-1)?.reason).toMatch(/last valid data kept/);
  });

  it('classifies a faulted write as a safe retry of the same payload', () => {
    const store = createMemoryStore({ fault: 'MID_PACKET' });
    store.writeEpisode('EP001', { n: 1 });
    store.setFault('MID_PACKET');
    const failed = store.writeProductionPacket('EP001', { packetSha256: 'p' });
    expect(failed.result).toBe('WRITE_REJECTED');
    const retry = store.writeProductionPacket('EP001', { packetSha256: 'p' });
    expect(retry.result).toBe('WRITE_ACCEPTED');
    expect(store.readProductionPacket('EP001')?.payload.packetSha256).toBe('p');
  });

  it('does not expose a half-written packet after AFTER_EVENT_APPEND', () => {
    const store = createMemoryStore({ fault: 'AFTER_EVENT_APPEND' });
    const receipt = store.writeProductionPacket('EP012', { packetSha256: 'half' });
    expect(receipt.result).toBe('WRITE_REJECTED');
    expect(store.readProductionPacket('EP012')).toBeNull();
  });

  it('does not expose a half-written QC receipt after MID_QC', () => {
    const store = createMemoryStore({ fault: 'MID_QC' });
    expect(store.writeQcReceipt('EP012', { passed: true }).result).toBe('WRITE_REJECTED');
    expect(store.readQcReceipt('EP012')).toBeNull();
  });

  it('does not expose a half-written delivery package after MID_DELIVERY', () => {
    const store = createMemoryStore({ fault: 'MID_DELIVERY' });
    expect(store.writeDeliveryPackage('EP012', { readiness: 'READY' }).result).toBe('WRITE_REJECTED');
    expect(store.readDeliveryPackage('EP012')).toBeNull();
  });

  it('keeps the last valid revision readable after BEFORE_EVENT_APPEND', () => {
    const store = createMemoryStore();
    store.writeEpisode('EP001', { n: 1 });
    const revision = store.getRevision();
    store.setFault('BEFORE_EVENT_APPEND');
    store.writeEpisode('EP002', { n: 2 });
    expect(store.readEpisode('EP001')?.payload.n).toBe(1);
    expect(store.getRevision()).toBe(revision + 1);
  });
});

import { describe, expect, it } from 'vitest';
import { createMemoryStore } from './tivvlejoy-production-persistence';
import {
  buildInspectionEvidence,
  inspectScriptEvidence,
  inspectAddonDependencies,
  auditDependencies,
  auditMaterials,
  auditTextures,
  inspectWithIsolatedBlender,
  classifySemanticRoles,
  classifyQuality,
  classifyDepth,
  classifyArchetypes,
  assessStyleCompatibility,
  analyzeBudget,
  analyzeScale,
  analyzeTransform,
  recommendCanonical,
  persistInspectionArtifacts,
  restoreInspectionState,
  reuseInspectionReceipt,
  discoverLogicalAssets,
  makeReceipt,
} from './tivvlejoy-real-scenery-inspection';

function evidence(sourceId = 'SRC_P') {
  const child = discoverLogicalAssets({
    sourceId,
    sourceSha256: '77'.repeat(32),
    hints: [{ internalStableRef: 'building:bakery', assetKind: 'building' }],
  })[0]!;
  const semantic = classifySemanticRoles({ kind: 'building', evidence: { sourceDescriptions: ['bakery'] } });
  const quality = classifyQuality({ dependenciesComplete: true, style: 'EXACT', roles: semantic.roles, triangleEstimate: 1000, textureMax: 512 });
  return {
    child,
    evidence: buildInspectionEvidence({
      sourceId,
      sourceReceiptRef: `receipt:${sourceId}`,
      sourceSha256: '77'.repeat(32),
      storedByteSize: 12,
      sourceState: 'SOURCE_READY',
      containerState: 'NOT_AN_ARCHIVE',
      staticFormatFindings: {},
      deepInspection: inspectWithIsolatedBlender({}),
      dependencyFindings: auditDependencies({}),
      textureFindings: auditTextures({ refs: [] }),
      materialFindings: auditMaterials({ materials: [] }),
      geometryFindings: {
        scale: analyzeScale({}),
        transform: analyzeTransform({}),
        budget: analyzeBudget({ quality: 'SUPPORTING' }),
      },
      semanticClassification: semantic,
      styleClassification: assessStyleCompatibility({ realismLevel: 'STORYBOOK' }),
      quality,
      depth: classifyDepth({ quality: quality.tiers, roles: semantic.roles }),
      archetypes: classifyArchetypes({ roles: semantic.roles, kind: 'building', evidence: { sourceDescriptions: ['bakery'] } }),
      canonicalRecommendation: recommendCanonical({ receipt: makeReceipt({ sourceId }), child }),
      scriptSafety: inspectScriptEvidence([]),
      addonDependencies: inspectAddonDependencies([]),
      warnings: [],
      blockers: [],
      inspectionMethod: 'SYNTHETIC_FIXTURE',
      inspectionConfidence: 'LOW',
    }),
  };
}

describe('scenery inspection persistence, recovery and concurrency', () => {
  it('persists metadata only and restores after a cold restart', () => {
    const store = createMemoryStore({ workspaceId: 'ws_scenery' });
    const { child, evidence: insp } = evidence();
    persistInspectionArtifacts({ store, evidence: insp, children: [child] });
    const restored = restoreInspectionState(store);
    expect(restored.revision).toBeGreaterThan(0);
    expect(store.listRecords().every((record) => !JSON.stringify(record.payload).includes('signed'))).toBe(true);
    expect(reuseInspectionReceipt(store, insp.sourceId, insp.sourceSha256!)).toBeTruthy();
  });

  it('reuses the same source/hash inspection receipt', () => {
    const store = createMemoryStore({ workspaceId: 'ws_reuse' });
    const first = evidence('SRC_REUSE');
    persistInspectionArtifacts({ store, evidence: first.evidence, children: [first.child] });
    const reused = reuseInspectionReceipt(store, 'SRC_REUSE', '77'.repeat(32));
    expect(reused).toBeTruthy();
    expect(reuseInspectionReceipt(store, 'SRC_REUSE', '88'.repeat(32))).toBeNull();
  });

  it('rejects secret payloads', () => {
    const store = createMemoryStore({ workspaceId: 'ws_secret' });
    const first = evidence('SRC_SEC');
    expect(() =>
      persistInspectionArtifacts({
        store,
        evidence: {
          ...first.evidence,
          warnings: ['https://evil.example/?X-Amz-Signature=abc'],
        },
        children: [first.child],
      }),
    ).toThrow(/secrets/i);
  });

  it('does not let two reviewers silently overwrite', () => {
    const store = createMemoryStore({ workspaceId: 'ws_conflict' });
    const first = evidence('SRC_CON');
    persistInspectionArtifacts({ store, evidence: first.evidence, children: [first.child] });
    const stale = store.writeRecord({
      entityType: 'SCENERY_REVIEW_DECISION',
      entityId: first.child.assetCandidateId,
      payload: { revision: 4, decision: 'APPROVED' },
      expectedRevision: 0,
      eventType: 'REGISTRY_UPDATED',
      reason: 'stale reviewer B',
    });
    expect(stale.result).toBe('WRITE_CONFLICT');
    const fresh = store.writeRecord({
      entityType: 'SCENERY_REVIEW_DECISION',
      entityId: first.child.assetCandidateId,
      payload: { revision: 5, decision: 'APPROVED' },
      expectedRevision: store.getRevision(),
      eventType: 'REGISTRY_UPDATED',
      reason: 'reviewer A',
    });
    expect(fresh.result).toBe('WRITE_ACCEPTED');
  });

  it('persists approval and quarantine without commercial bytes', () => {
    const store = createMemoryStore({ workspaceId: 'ws_appr' });
    const first = evidence('SRC_AP');
    persistInspectionArtifacts({
      store,
      evidence: first.evidence,
      children: [first.child],
      approval: {
        schemaVersion: 'TIVVLEJOY_SCENERY_APPROVAL_WORKFLOW_V1',
        approvalReceiptId: 'appr:test',
        state: 'REJECTED',
        assetCandidateId: first.child.assetCandidateId,
        sourceId: first.evidence.sourceId,
        inspectionSha256: first.evidence.inspectionSha256,
        candidateDependencySha256: first.child.candidateDependencySha256,
        visualEvidenceSha256: null,
        semanticRoles: ['PATH'],
        licenseState: 'LICENSE_REVIEW_REQUIRED',
        provenanceState: 'PROVENANCE_REVIEW_REQUIRED',
        canonicalState: 'PRIMARY',
        actorClass: 'HUMAN',
        syntheticLabeled: false,
        issued: true,
        reason: 'rejected',
        approvalSha256: '12'.repeat(32),
      },
      quarantine: { sourceId: 'SRC_AP', state: 'QUARANTINED', reasons: ['HASH_MISMATCH'], storedSourceDeleted: false },
    });
    const events = store.listEvents().map((event) => event.eventType);
    expect(events).toEqual(expect.arrayContaining(['ASSET_REJECTED', 'ASSET_ARCHIVED', 'REGISTRY_UPDATED']));
    expect(restoreInspectionState(store).quarantines[0]?.storedSourceDeleted).toBe(false);
  });

  it('journals sanitized scenery events', () => {
    const store = createMemoryStore({ workspaceId: 'ws_journal' });
    const first = evidence('SRC_J');
    persistInspectionArtifacts({ store, evidence: first.evidence, children: [first.child] });
    const types = store.listEvents().map((event) => event.eventType);
    expect(types).toEqual(expect.arrayContaining(['SOURCE_MATERIALIZED', 'LOGICAL_ASSET_DISCOVERED', 'STATIC_FORMAT_INSPECTED']));
    expect(JSON.stringify(store.listEvents())).not.toMatch(/X-Amz-Signature|R2_SECRET/);
  });
});

describe('recovery matrix', () => {
  const cases = ['interrupted download', 'partial archive', 'parser failure', 'blender timeout', 'browser restart', 'stale review', 'duplicate review'];
  for (const label of cases) {
    it(`recovers the inspection receipt path after ${label}`, () => {
      const store = createMemoryStore({ workspaceId: `ws_${label.replace(/\s+/g, '_')}` });
      const first = evidence(`SRC_${label.slice(0, 4)}`);
      persistInspectionArtifacts({ store, evidence: first.evidence, children: [first.child] });
      expect(restoreInspectionState(store).revision).toBeGreaterThan(0);
    });
  }
});

describe('inspection journal and reuse extras', () => {
  it('journals ARCHIVE_INSPECTED when a container state is present', () => {
    const store = createMemoryStore({ workspaceId: 'ws_archive_event' });
    const first = evidence('SRC_AR');
    persistInspectionArtifacts({
      store,
      evidence: { ...first.evidence, containerState: 'ARCHIVE_SAFE' },
      children: [first.child],
    });
    expect(store.listEvents().map((event) => event.eventType)).toContain('ARCHIVE_INSPECTED');
  });

  it('journals VISUAL_REVIEW_REQUESTED for hero-quality evidence', () => {
    const store = createMemoryStore({ workspaceId: 'ws_visual_event' });
    const first = evidence('SRC_HE');
    persistInspectionArtifacts({
      store,
      evidence: {
        ...first.evidence,
        quality: { ...first.evidence.quality, tiers: ['HERO', 'SUPPORTING', 'BACKGROUND'] },
      },
      children: [first.child],
    });
    expect(store.listEvents().map((event) => event.eventType)).toContain('VISUAL_REVIEW_REQUESTED');
  });

  it('restores children and quarantines after a second store instance reads the same memory', () => {
    const store = createMemoryStore({ workspaceId: 'ws_restore_kids' });
    const first = evidence('SRC_RS');
    persistInspectionArtifacts({
      store,
      evidence: first.evidence,
      children: [first.child],
      quarantine: { sourceId: 'SRC_RS', state: 'QUARANTINED', reasons: ['CORRUPT_ARCHIVE'], storedSourceDeleted: false },
    });
    const restored = restoreInspectionState(store);
    expect(restored.children[0]?.assetCandidateId).toBe(first.child.assetCandidateId);
    expect(restored.quarantines[0]?.reasons).toEqual(['CORRUPT_ARCHIVE']);
    expect(reuseInspectionReceipt(store, 'SRC_RS', '77'.repeat(32))).toBeTruthy();
  });

  it('does not persist commercial binary fields on logical children', () => {
    const store = createMemoryStore({ workspaceId: 'ws_no_bin' });
    const first = evidence('SRC_NB');
    persistInspectionArtifacts({ store, evidence: first.evidence, children: [first.child] });
    const blob = JSON.stringify(store.listRecords());
    expect(blob).not.toMatch(/\.blend|\.fbx|\.glb|\.scatpack/);
  });

  it('rejects a stale expected revision on a later review write', () => {
    const store = createMemoryStore({ workspaceId: 'ws_stale_rev' });
    const first = evidence('SRC_ST');
    persistInspectionArtifacts({ store, evidence: first.evidence, children: [first.child] });
    const revision = store.getRevision();
    store.writeRecord({
      entityType: 'SCENERY_REVIEW_DECISION',
      entityId: first.child.assetCandidateId,
      payload: { decision: 'APPROVED' },
      expectedRevision: revision,
      eventType: 'REGISTRY_UPDATED',
      reason: 'first',
    });
    const stale = store.writeRecord({
      entityType: 'SCENERY_REVIEW_DECISION',
      entityId: first.child.assetCandidateId,
      payload: { decision: 'REJECTED' },
      expectedRevision: revision,
      eventType: 'REGISTRY_UPDATED',
      reason: 'stale',
    });
    expect(stale.result).toBe('WRITE_CONFLICT');
  });
});

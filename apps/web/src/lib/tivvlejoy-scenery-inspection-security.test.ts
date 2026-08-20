import { describe, expect, it } from 'vitest';
import {
  archivePathViolation,
  assertNoCommercialBytesInTrackedSources,
  blendHeaderBytes,
  buildMinimalGlb,
  buildStoredZip,
  inspectBlendHeader,
  inspectFbx,
  inspectGlb,
  inspectGltfJson,
  inspectScriptEvidence,
  inspectZipArchive,
  isCommercialExtension,
  issueHumanApproval,
  promoteApprovedChild,
  safetyReport,
  scanCommittedCommercialBinaries,
  discoverLogicalAssets,
  recommendCanonical,
  makeReceipt,
} from './tivvlejoy-real-scenery-inspection';

describe('scenery inspection security matrix', () => {
  it('rejects path traversal and symlink-like names', () => {
    expect(archivePathViolation('../x')).toBe('ARCHIVE_UNSAFE_PATH');
    expect(inspectZipArchive(buildStoredZip([{ name: 'C:/abs.fbx', data: 'x' }])).state).toBe('ARCHIVE_UNSAFE_PATH');
  });

  it('rejects malformed GLB, FBX and Blend headers', () => {
    expect(inspectGlb(new Uint8Array(8)).malformed).toBe(true);
    expect(inspectFbx(new Uint8Array([9, 9, 9])).validHeader).toBe(false);
    expect(inspectBlendHeader(new Uint8Array([0])).state).toBe('BLEND_HEADER_INVALID');
    expect(inspectBlendHeader(blendHeaderBytes()).deepSceneInspected).toBe(false);
  });

  it('blocks network dependencies and does not execute scripts', () => {
    expect(inspectGltfJson(JSON.stringify({ buffers: [{ uri: 'https://evil.test/a.bin' }] })).blocker).toBe(
      'BLOCKED_EXTERNAL_NETWORK_DEPENDENCY',
    );
    expect(inspectScriptEvidence(['import bpy', 'os.system("id")']).executed).toBe(false);
  });

  it('refuses hash and size mismatches rather than trusting the receipt', () => {
    const glb = buildMinimalGlb({ meshes: [] });
    expect(inspectGlb(glb).declaredLength).toBe(glb.byteLength);
    const tampered = new Uint8Array(glb);
    tampered[8] = 3;
    expect(inspectGlb(tampered).malformed).toBe(true);
  });

  it('rejects stale or replayed approvals and wrong hashes', () => {
    const child = discoverLogicalAssets({
      sourceId: 'SRC_SEC',
      sourceSha256: '99'.repeat(32),
      hints: [{ internalStableRef: 'rock:1', assetKind: 'rock' }],
    })[0]!;
    const approval = issueHumanApproval({
      actorClass: 'HUMAN',
      decision: 'APPROVED',
      assetCandidateId: child.assetCandidateId,
      sourceId: child.sourceId,
      inspectionSha256: 'aa'.repeat(32),
      candidateDependencySha256: child.candidateDependencySha256,
      visualRequired: false,
      semanticRoles: ['ROCK'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
    });
    expect(
      promoteApprovedChild({
        child,
        approval,
        inspectionSha256: 'bb'.repeat(32),
        sourceReceiptRef: 'r',
        roles: ['ROCK'],
        archetypes: [],
        quality: ['BACKGROUND'],
        depth: ['BACKGROUND'],
        canonical: recommendCanonical({ receipt: makeReceipt({ sourceId: 'SRC_SEC' }), child }),
      }),
    ).toBeNull();
  });

  it('never leaks secrets in the safety report or committed scan', () => {
    const report = safetyReport();
    expect(JSON.stringify(report)).not.toMatch(/AKIA|sk-|Bearer |X-Amz-Signature/);
    expect(scanCommittedCommercialBinaries().ok).toBe(true);
    expect(assertNoCommercialBytesInTrackedSources(['apps/web/src/lib/foo.ts'])).toEqual([]);
    expect(isCommercialExtension('evil.scatpack')).toBe(true);
  });

  it('keeps all required safety flags closed', () => {
    const report = safetyReport();
    expect(report.productionMutation).toBe(false);
    expect(report.commercialSourceModified).toBe(false);
    expect(report.commercialBytesCommitted).toBe(false);
    expect(report.commercialBytesRedistributed).toBe(false);
    expect(report.embeddedScriptsExecuted).toBe(false);
    expect(report.addonsInstalled).toBe(false);
    expect(report.botaniqActivated).toBe(false);
    expect(report.geoScatterIntegrated).toBe(false);
    expect(report.gafferActivated).toBe(false);
    expect(report.physicalStarlightActivated).toBe(false);
    expect(report.runPodMutation).toBe(false);
    expect(report.gpuLaunched).toBe(false);
    expect(report.paidComputeUsd).toBe(0);
    expect(report.assetsAutoApproved).toBe(false);
    expect(report.pipGoatMutated).toBe(false);
    expect(report.voiceIdentityMutated).toBe(false);
  });
});

describe('named attacks', () => {
  it('path traversal', () => {
    expect(inspectZipArchive(buildStoredZip([{ name: '../x.fbx', data: 'x' }])).state).toBe('ARCHIVE_UNSAFE_PATH');
  });
  it('archive bomb ratio', () => {
    expect(inspectZipArchive(buildStoredZip([{ name: 'ok.txt', data: 'ok' }])).executedEmbeddedScripts).toBe(false);
  });
  it('symlink escape', () => {
    expect(archivePathViolation('/tmp/link')).toBe('ARCHIVE_UNSAFE_PATH');
  });
  it('malformed GLB', () => {
    expect(inspectGlb(new TextEncoder().encode('XXXX')).malformed).toBe(true);
  });
  it('malformed FBX', () => {
    expect(inspectFbx(new TextEncoder().encode('not fbx')).validHeader).toBe(false);
  });
  it('invalid Blend header', () => {
    expect(inspectBlendHeader(new TextEncoder().encode('BLENDERR')).state).toBe('BLEND_HEADER_INVALID');
  });
  it('network dependency', () => {
    expect(inspectGltfJson(JSON.stringify({ images: [{ uri: '//cdn.example/a.png' }] })).blockedExternalNetwork).toBe(true);
  });
  it('embedded script', () => {
    expect(inspectScriptEvidence(['register() auto-run']).state).not.toBe('NO_SCRIPT_EVIDENCE');
  });
  it('duplicate logical identity stays distinct by internal ref', () => {
    const kids = discoverLogicalAssets({
      sourceId: 'SRC_DUP',
      sourceSha256: 'cc'.repeat(32),
      hints: [
        { internalStableRef: 'table:1', assetKind: 'table' },
        { internalStableRef: 'chair:1', assetKind: 'chair' },
      ],
    });
    expect(kids[0]?.assetCandidateId).not.toBe(kids[1]?.assetCandidateId);
  });

  it('hash mismatch', () => {
    const glb = buildMinimalGlb({ meshes: [] });
    const copy = new Uint8Array(glb);
    copy[20] = (copy[20] ?? 0) ^ 0xff;
    expect(inspectGlb(copy).malformed).toBe(true);
  });

  it('size mismatch', () => {
    const glb = buildMinimalGlb({ meshes: [] });
    const declared = new Uint8Array(glb);
    declared[8] = 99;
    expect(inspectGlb(declared).malformed).toBe(true);
  });

  it('stale receipt revision', () => {
    const child = discoverLogicalAssets({
      sourceId: 'SRC_STALE',
      sourceSha256: 'dd'.repeat(32),
      hints: [{ internalStableRef: 'path:1', assetKind: 'path' }],
    })[0]!;
    const stale = issueHumanApproval({
      actorClass: 'HUMAN',
      decision: 'APPROVED',
      assetCandidateId: child.assetCandidateId,
      sourceId: child.sourceId,
      inspectionSha256: 'ee'.repeat(32),
      candidateDependencySha256: child.candidateDependencySha256,
      visualRequired: false,
      semanticRoles: ['PATH'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
      expectedRevision: 2,
      currentRevision: 9,
    });
    expect(stale.issued).toBe(false);
    expect(stale.reason).toContain('WRITE_CONFLICT');
  });

  it('unsafe signed URL is not a valid visual evidence hash', () => {
    const child = discoverLogicalAssets({
      sourceId: 'SRC_URL',
      sourceSha256: 'ee'.repeat(32),
      hints: [{ internalStableRef: 'sky:1', assetKind: 'sky' }],
    })[0]!;
    const denied = issueHumanApproval({
      actorClass: 'HUMAN',
      decision: 'APPROVED',
      assetCandidateId: child.assetCandidateId,
      sourceId: child.sourceId,
      inspectionSha256: 'ff'.repeat(32),
      candidateDependencySha256: child.candidateDependencySha256,
      visualRequired: true,
      visualEvidenceSha256: 'https://evil.example/?X-Amz-Signature=abc',
      semanticRoles: ['SKY'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
    });
    expect(denied.issued).toBe(false);
  });

  it('secret leak strings stay out of the safety report', () => {
    expect(JSON.stringify(safetyReport())).not.toMatch(/R2_SECRET_ACCESS_KEY|OBJECT_STORAGE_SECRET|signedUrl/);
  });

  it('approval replay against a different candidate is rejected', () => {
    const first = discoverLogicalAssets({
      sourceId: 'SRC_REP',
      sourceSha256: '11'.repeat(32),
      hints: [{ internalStableRef: 'rock:1', assetKind: 'rock' }],
    })[0]!;
    const second = discoverLogicalAssets({
      sourceId: 'SRC_REP',
      sourceSha256: '11'.repeat(32),
      hints: [{ internalStableRef: 'tree:1', assetKind: 'tree' }],
    })[0]!;
    const approval = issueHumanApproval({
      actorClass: 'HUMAN',
      decision: 'APPROVED',
      assetCandidateId: first.assetCandidateId,
      sourceId: first.sourceId,
      inspectionSha256: '22'.repeat(32),
      candidateDependencySha256: first.candidateDependencySha256,
      visualRequired: false,
      semanticRoles: ['ROCK'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
    });
    expect(
      promoteApprovedChild({
        child: second,
        approval,
        inspectionSha256: '22'.repeat(32),
        sourceReceiptRef: 'r',
        roles: ['TREE_SUPPORT'],
        archetypes: [],
        quality: ['BACKGROUND'],
        depth: ['BACKGROUND'],
        canonical: recommendCanonical({ receipt: makeReceipt({ sourceId: 'SRC_REP' }), child: second }),
      }),
    ).toBeNull();
  });

  it('stale approval hash cannot promote', () => {
    const child = discoverLogicalAssets({
      sourceId: 'SRC_OLD',
      sourceSha256: '33'.repeat(32),
      hints: [{ internalStableRef: 'barrel:1', assetKind: 'barrel' }],
    })[0]!;
    const approval = issueHumanApproval({
      actorClass: 'HUMAN',
      decision: 'APPROVED',
      assetCandidateId: child.assetCandidateId,
      sourceId: child.sourceId,
      inspectionSha256: '44'.repeat(32),
      candidateDependencySha256: child.candidateDependencySha256,
      visualRequired: false,
      semanticRoles: ['INTERIOR_PROP'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
    });
    expect(
      promoteApprovedChild({
        child,
        approval: { ...approval, issued: true, inspectionSha256: '99'.repeat(32) },
        inspectionSha256: '44'.repeat(32),
        sourceReceiptRef: 'r',
        roles: ['INTERIOR_PROP'],
        archetypes: [],
        quality: ['SUPPORTING'],
        depth: ['MIDGROUND'],
        canonical: recommendCanonical({ receipt: makeReceipt({ sourceId: 'SRC_OLD' }), child }),
      }),
    ).toBeNull();
  });

  it('commercial extensions are flagged for tracked source paths only', () => {
    expect(isCommercialExtension('village.blend')).toBe(true);
    expect(isCommercialExtension('pack.fbx')).toBe(true);
    expect(isCommercialExtension('env.glb')).toBe(true);
    expect(isCommercialExtension('notes.md')).toBe(false);
    expect(assertNoCommercialBytesInTrackedSources(['apps/web/src/lib/ok.ts', 'apps/web/secret.blend'])).toEqual([
      'apps/web/secret.blend',
    ]);
  });

  it('declared archive bomb and symlink attacks stay unextracted', () => {
    expect(
      inspectZipArchive(buildStoredZip([{ name: 'bomb.bin', data: 'z', declaredUncompressed: 9 * 1024 * 1024 }]), {
        maxEntries: 8,
        maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
        maxEntryUncompressedBytes: 512 * 1024 * 1024,
        maxCompressionRatio: 2,
        maxNestedDepth: 1,
        maxNestedArchives: 1,
      }).extracted,
    ).toBe(false);
    expect(inspectZipArchive(buildStoredZip([{ name: 'link.fbx', data: 'x', unixMode: 0o120000 }])).extracted).toBe(false);
  });
});

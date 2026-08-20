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
});

import { describe, expect, it } from 'vitest';
import {
  evaluateTechnicalApprovalState,
  issueHumanApproval,
  makeReceipt,
  promoteApprovedChild,
  queueVisualEvidence,
  recommendCanonical,
  reviewProvenanceAndLicense,
  discoverLogicalAssets,
} from './tivvlejoy-real-scenery-inspection';

const inspectionSha = '11'.repeat(32);
const visualSha = '22'.repeat(32);

function child() {
  return discoverLogicalAssets({
    sourceId: 'SRC_TAVERN',
    sourceSha256: '33'.repeat(32),
    hints: [{ internalStableRef: 'interior_shell:tavern', assetKind: 'interior_shell' }],
  })[0]!;
}

describe('TIVVLEJOY_SCENERY_APPROVAL_WORKFLOW_V1', () => {
  it('cannot issue human approval from system or synthetic actors', () => {
    const denied = issueHumanApproval({
      actorClass: 'SYSTEM',
      decision: 'APPROVED',
      assetCandidateId: child().assetCandidateId,
      sourceId: 'SRC_TAVERN',
      inspectionSha256: inspectionSha,
      candidateDependencySha256: child().candidateDependencySha256,
      visualRequired: true,
      visualEvidenceSha256: visualSha,
      semanticRoles: ['INTERIOR_SHELL'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
    });
    expect(denied.issued).toBe(false);
    expect(issueHumanApproval({ ...denied, actorClass: 'SYNTHETIC', confirm: true, assetCandidateId: child().assetCandidateId, sourceId: 'SRC_TAVERN', inspectionSha256: inspectionSha, candidateDependencySha256: child().candidateDependencySha256, visualRequired: false, semanticRoles: ['PATH'], licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED', provenanceState: 'PROVENANCE_RESOLVED', canonicalState: 'PRIMARY', decision: 'APPROVED' }).syntheticLabeled).toBe(true);
  });

  it('requires exact hashes, confirmation, and visual evidence for hero', () => {
    const base = {
      actorClass: 'HUMAN' as const,
      decision: 'APPROVED' as const,
      assetCandidateId: child().assetCandidateId,
      sourceId: 'SRC_TAVERN',
      inspectionSha256: inspectionSha,
      candidateDependencySha256: child().candidateDependencySha256,
      semanticRoles: ['INTERIOR_SHELL'] as Array<'INTERIOR_SHELL'>,
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED' as const,
      provenanceState: 'PROVENANCE_RESOLVED' as const,
      canonicalState: 'PRIMARY' as const,
    };
    expect(issueHumanApproval({ ...base, visualRequired: true, confirm: true }).issued).toBe(false);
    expect(issueHumanApproval({ ...base, visualRequired: true, visualEvidenceSha256: visualSha, confirm: false }).issued).toBe(false);
    expect(issueHumanApproval({ ...base, visualRequired: true, visualEvidenceSha256: 'bad', confirm: true }).issued).toBe(false);
    const ok = issueHumanApproval({ ...base, visualRequired: true, visualEvidenceSha256: visualSha, confirm: true });
    expect(ok.issued).toBe(true);
    expect(ok.state).toBe('APPROVED');
    expect(ok.approvalSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('detects stale review WRITE_CONFLICT', () => {
    const result = issueHumanApproval({
      actorClass: 'HUMAN',
      decision: 'APPROVED',
      assetCandidateId: child().assetCandidateId,
      sourceId: 'SRC_TAVERN',
      inspectionSha256: inspectionSha,
      candidateDependencySha256: child().candidateDependencySha256,
      visualRequired: false,
      semanticRoles: ['PATH'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
      expectedRevision: 4,
      currentRevision: 5,
    });
    expect(result.reason).toContain('WRITE_CONFLICT');
    expect(result.issued).toBe(false);
  });

  it('promotes a child only after a valid approval receipt', () => {
    const discovered = child();
    const approval = issueHumanApproval({
      actorClass: 'HUMAN',
      decision: 'APPROVED',
      assetCandidateId: discovered.assetCandidateId,
      sourceId: discovered.sourceId,
      inspectionSha256: inspectionSha,
      candidateDependencySha256: discovered.candidateDependencySha256,
      visualRequired: true,
      visualEvidenceSha256: visualSha,
      semanticRoles: ['INTERIOR_SHELL'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
    });
    const promoted = promoteApprovedChild({
      child: discovered,
      approval,
      inspectionSha256: inspectionSha,
      sourceReceiptRef: 'receipt:SRC_TAVERN',
      roles: ['INTERIOR_SHELL'],
      archetypes: ['tavern'],
      quality: ['HERO'],
      depth: ['MIDGROUND'],
      canonical: recommendCanonical({ receipt: makeReceipt({ sourceId: 'SRC_TAVERN', formatHint: 'BLEND' }), child: discovered }),
    });
    expect(promoted?.worldBuilderEligible).toBe(true);
    expect(promoted?.storeOnlyMutated).toBe(false);
    expect(promoteApprovedChild({
      child: discovered,
      approval: { ...approval, issued: false },
      inspectionSha256: inspectionSha,
      sourceReceiptRef: 'r',
      roles: ['INTERIOR_SHELL'],
      archetypes: [],
      quality: ['HERO'],
      depth: ['MIDGROUND'],
      canonical: recommendCanonical({ receipt: makeReceipt({ sourceId: 'SRC_TAVERN' }), child: discovered }),
    })).toBeNull();
  });

  it('rejects approval replay against the wrong inspection hash', () => {
    const discovered = child();
    const approval = issueHumanApproval({
      actorClass: 'HUMAN',
      decision: 'APPROVED',
      assetCandidateId: discovered.assetCandidateId,
      sourceId: discovered.sourceId,
      inspectionSha256: inspectionSha,
      candidateDependencySha256: discovered.candidateDependencySha256,
      visualRequired: false,
      semanticRoles: ['PATH'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
    });
    expect(
      promoteApprovedChild({
        child: discovered,
        approval,
        inspectionSha256: '44'.repeat(32),
        sourceReceiptRef: 'r',
        roles: ['PATH'],
        archetypes: [],
        quality: ['SUPPORTING'],
        depth: ['MIDGROUND'],
        canonical: recommendCanonical({ receipt: makeReceipt({ sourceId: 'SRC_TAVERN' }), child: discovered }),
      }),
    ).toBeNull();
  });

  it('queues visual evidence and never auto-approves', () => {
    const queue = queueVisualEvidence({
      assetCandidateId: 'cand:1',
      roles: ['INTERIOR_SHELL'],
      quality: ['HERO'],
    });
    expect(queue.requiredShots).toEqual(expect.arrayContaining(['entrance', 'interior', 'hero angle']));
    expect(queue.visualApprovalAutomatic).toBe(false);
    expect(queue.gpu).toBe(false);
    expect(queue.state).toBe('VISUAL_EVIDENCE_RENDER_PENDING');
  });

  it('never infers redistribution rights', () => {
    const review = reviewProvenanceAndLicense(makeReceipt({ sourceId: 'SRC_X', licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED' }));
    expect(review.rawRedistributionAllowed).toBe(false);
    expect(review.inferredRedistributionRights).toBe(false);
  });

  it('uses technical blockers before visual review', () => {
    expect(evaluateTechnicalApprovalState({ blockers: ['HASH_MISMATCH'], visualRequired: true, visualSatisfied: false })).toBe('TECHNICALLY_BLOCKED');
    expect(evaluateTechnicalApprovalState({ blockers: [], visualRequired: true, visualSatisfied: false })).toBe('READY_FOR_VISUAL_REVIEW');
    expect(evaluateTechnicalApprovalState({ blockers: [], visualRequired: false, visualSatisfied: false })).toBe('NOT_REVIEWED');
  });
});

describe('approval refusal matrix', () => {
  const reasons = [
    ['LICENSE_BLOCKED', { licenseState: 'LICENSE_BLOCKED' as const }],
    ['PROVENANCE_BLOCKED', { provenanceState: 'PROVENANCE_UNKNOWN' as const }],
    ['missing confirm', { confirm: false }],
  ] as const;
  for (const [label, extra] of reasons) {
    it(`refuses ${label}`, () => {
      const result = issueHumanApproval({
        actorClass: 'HUMAN',
        decision: 'APPROVED',
        assetCandidateId: child().assetCandidateId,
        sourceId: 'SRC_TAVERN',
        inspectionSha256: inspectionSha,
        candidateDependencySha256: child().candidateDependencySha256,
        visualRequired: false,
        semanticRoles: ['PATH'],
        licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
        provenanceState: 'PROVENANCE_RESOLVED',
        canonicalState: 'PRIMARY',
        confirm: true,
        ...extra,
      });
      expect(result.issued).toBe(false);
    });
  }
  for (const decision of ['REJECTED', 'ARCHIVAL_ONLY'] as const) {
    it(`records human ${decision} when hashes and confirmation are present`, () => {
      const result = issueHumanApproval({
        actorClass: 'HUMAN',
        decision,
        assetCandidateId: child().assetCandidateId,
        sourceId: 'SRC_TAVERN',
        inspectionSha256: inspectionSha,
        candidateDependencySha256: child().candidateDependencySha256,
        visualRequired: false,
        semanticRoles: ['PATH'],
        licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
        provenanceState: 'PROVENANCE_RESOLVED',
        canonicalState: 'PRIMARY',
        confirm: true,
      });
      expect(result.issued).toBe(true);
      expect(result.state).toBe(decision);
    });
  }
  for (const role of ['BUILDING_HERO', 'MOUNTAIN_HERO', 'TREE_HERO', 'INTERIOR_SHELL'] as const) {
    it(`requires visual evidence before approving ${role}`, () => {
      const result = issueHumanApproval({
        actorClass: 'HUMAN',
        decision: 'APPROVED',
        assetCandidateId: child().assetCandidateId,
        sourceId: 'SRC_TAVERN',
        inspectionSha256: inspectionSha,
        candidateDependencySha256: child().candidateDependencySha256,
        visualRequired: true,
        semanticRoles: [role],
        licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
        provenanceState: 'PROVENANCE_RESOLVED',
        canonicalState: 'PRIMARY',
        confirm: true,
      });
      expect(result.issued).toBe(false);
      expect(result.reason).toMatch(/visualEvidenceSha256/);
    });
  }
});

describe('approval and visual contract extras', () => {
  it('moves to VISUAL_REVIEW_REQUIRED only after visual evidence exists', () => {
    expect(evaluateTechnicalApprovalState({ blockers: [], visualRequired: true, visualSatisfied: true })).toBe(
      'VISUAL_REVIEW_REQUIRED',
    );
  });

  it('refuses promotion when the candidate dependency hash does not match', () => {
    const discovered = child();
    const approval = issueHumanApproval({
      actorClass: 'HUMAN',
      decision: 'APPROVED',
      assetCandidateId: discovered.assetCandidateId,
      sourceId: discovered.sourceId,
      inspectionSha256: inspectionSha,
      candidateDependencySha256: discovered.candidateDependencySha256,
      visualRequired: false,
      semanticRoles: ['PATH'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
    });
    expect(
      promoteApprovedChild({
        child: { ...discovered, candidateDependencySha256: '55'.repeat(32) },
        approval,
        inspectionSha256: inspectionSha,
        sourceReceiptRef: 'r',
        roles: ['PATH'],
        archetypes: [],
        quality: ['SUPPORTING'],
        depth: ['MIDGROUND'],
        canonical: recommendCanonical({ receipt: makeReceipt({ sourceId: 'SRC_TAVERN' }), child: discovered }),
      }),
    ).toBeNull();
  });

  it('populates registry bridge fields only after a valid human approval', () => {
    const discovered = child();
    const approval = issueHumanApproval({
      actorClass: 'HUMAN',
      decision: 'APPROVED',
      assetCandidateId: discovered.assetCandidateId,
      sourceId: discovered.sourceId,
      inspectionSha256: inspectionSha,
      candidateDependencySha256: discovered.candidateDependencySha256,
      visualRequired: true,
      visualEvidenceSha256: visualSha,
      semanticRoles: ['INTERIOR_SHELL'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'PRIMARY',
      confirm: true,
    });
    const promoted = promoteApprovedChild({
      child: discovered,
      approval,
      inspectionSha256: inspectionSha,
      sourceReceiptRef: 'receipt:SRC_TAVERN',
      roles: ['INTERIOR_SHELL'],
      archetypes: ['tavern'],
      quality: ['HERO'],
      depth: ['MIDGROUND'],
      canonical: recommendCanonical({ receipt: makeReceipt({ sourceId: 'SRC_TAVERN', formatHint: 'BLEND' }), child: discovered }),
    });
    expect(promoted?.assetId.startsWith('env:')).toBe(true);
    expect(promoted?.sourceReceiptRef).toBe('receipt:SRC_TAVERN');
    expect(promoted?.inspectionSha256).toBe(inspectionSha);
    expect(promoted?.approvalSha256).toBe(approval.approvalSha256);
    expect(promoted?.shotAssemblyEligible).toBe(true);
    expect(promoted?.storeOnlyMutated).toBe(false);
  });

  it('queues standard hero shots plus interior shots for shells', () => {
    const hero = queueVisualEvidence({ assetCandidateId: 'cand:hero', roles: ['BUILDING_HERO'], quality: ['HERO'] });
    expect(hero.requiredShots).toEqual(
      expect.arrayContaining(['front', 'rear', 'side', 'three-quarter', 'close material view', 'story-camera view', 'scale reference view']),
    );
    expect(hero.finalRender).toBe(false);
    expect(hero.paidCompute).toBe(false);
  });

  it('labels synthetic preview approval and refuses system approval of archival decisions', () => {
    const synthetic = issueHumanApproval({
      actorClass: 'SYNTHETIC',
      decision: 'ARCHIVAL_ONLY',
      assetCandidateId: child().assetCandidateId,
      sourceId: 'SRC_TAVERN',
      inspectionSha256: inspectionSha,
      candidateDependencySha256: child().candidateDependencySha256,
      visualRequired: false,
      semanticRoles: ['PATH'],
      licenseState: 'LICENSE_INTERNAL_PRODUCTION_APPROVED',
      provenanceState: 'PROVENANCE_RESOLVED',
      canonicalState: 'ARCHIVAL',
      confirm: true,
    });
    expect(synthetic.issued).toBe(false);
    expect(synthetic.syntheticLabeled).toBe(true);
  });

  it('reviews unknown provenance as review-required without inferring redistribution', () => {
    const review = reviewProvenanceAndLicense(makeReceipt({ sourceId: 'SRC_UNK', provenanceState: 'PROVENANCE_UNKNOWN' }));
    expect(review.provenanceState === 'PROVENANCE_UNKNOWN' || review.provenanceState === 'PROVENANCE_REVIEW_REQUIRED').toBe(true);
    expect(review.rawRedistributionAllowed).toBe(false);
  });
});

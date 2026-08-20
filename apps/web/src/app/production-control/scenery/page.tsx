import { SceneryApprovalReceiptForm } from '@/components/preview/SceneryApprovalReceipt';
import { SceneryChildAssetReview } from '@/components/preview/SceneryChildAssetReview';
import { SceneryInspectionControlRoom } from '@/components/preview/SceneryInspectionControlRoom';
import { buildSceneryInspectionControlRoom } from '@/lib/tivvlejoy-real-scenery-inspection/control-room';
import { discoverInspectionCatalog } from '@/lib/tivvlejoy-real-scenery-inspection/discovery';
import { makeCatalog } from '@/lib/tivvlejoy-real-scenery-inspection/fixtures';

export const dynamic = 'force-dynamic';

export default function ProductionControlSceneryPage() {
  const discovery = discoverInspectionCatalog(makeCatalog(8, 'SRC_REVIEW'));
  const model = buildSceneryInspectionControlRoom({
    discovery,
    evidenceClass: 'SYNTHETIC_FIXTURE',
  });
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <SceneryInspectionControlRoom model={model} />
      <SceneryChildAssetReview reports={[]} />
      <SceneryApprovalReceiptForm
        assetCandidate="cand:preview"
        sourceId="SRC_REVIEW_0001"
        inspectionHash={'ab'.repeat(32)}
        visualEvidence="VISUAL_EVIDENCE_RENDER_PENDING"
        semanticRoles={['INTERIOR_SHELL']}
        licenseState="LICENSE_REVIEW_REQUIRED"
        provenanceState="PROVENANCE_REVIEW_REQUIRED"
        canonicalState="PRIMARY"
        synthetic
      />
    </main>
  );
}

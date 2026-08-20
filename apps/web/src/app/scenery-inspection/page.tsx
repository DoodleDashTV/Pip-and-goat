import { SceneryInspectionControlRoom } from '@/components/preview/SceneryInspectionControlRoom';
import { buildSceneryInspectionControlRoom } from '@/lib/tivvlejoy-real-scenery-inspection/control-room';
import { discoverInspectionCatalog } from '@/lib/tivvlejoy-real-scenery-inspection/discovery';
import { makeCatalog } from '@/lib/tivvlejoy-real-scenery-inspection/fixtures';

export const dynamic = 'force-dynamic';

export default function SceneryInspectionPage() {
  const discovery = discoverInspectionCatalog(makeCatalog(12, 'SRC_PREVIEW'));
  const model = buildSceneryInspectionControlRoom({
    discovery,
    evidenceClass: 'SYNTHETIC_FIXTURE',
  });
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <SceneryInspectionControlRoom model={model} />
    </main>
  );
}

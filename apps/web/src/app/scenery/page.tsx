import { SceneryStudio } from '@/components/preview/SceneryStudio';
import { isPublicWebsitePreview } from '@/lib/public-preview';
import { hydratePreviewIntakeStoreSafely } from '@/lib/scenery/intake/hydrate-preview';
import { buildPublicScenerySnapshot } from '@/lib/scenery/snapshot';

export const dynamic = 'force-dynamic';

export default async function SceneryPage() {
  await hydratePreviewIntakeStoreSafely();
  return (
    <SceneryStudio publicPreview={isPublicWebsitePreview()} snapshot={buildPublicScenerySnapshot()} />
  );
}

import { SceneryStudio } from '@/components/preview/SceneryStudio';
import { isPublicWebsitePreview } from '@/lib/public-preview';
import { buildPublicScenerySnapshot } from '@/lib/scenery/snapshot';

export const dynamic = 'force-dynamic';

export default function SceneryPage() {
  return (
    <SceneryStudio publicPreview={isPublicWebsitePreview()} snapshot={buildPublicScenerySnapshot()} />
  );
}

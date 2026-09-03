import type { ReactNode } from 'react';
import { SceneryAssetIntake } from '@/components/preview/SceneryAssetIntake';
import { isPublicWebsitePreview } from '@/lib/public-preview';
import { hydratePreviewIntakeStoreSafely } from '@/lib/scenery/intake/hydrate-preview';
import { buildPublicScenerySnapshot } from '@/lib/scenery/snapshot';

export const dynamic = 'force-dynamic';

export default async function AssetIntakeLayout({ children }: { children: ReactNode }) {
  if (!isPublicWebsitePreview()) {
    return children;
  }

  await hydratePreviewIntakeStoreSafely();
  return <SceneryAssetIntake snapshot={buildPublicScenerySnapshot()} />;
}

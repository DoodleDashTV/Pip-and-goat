import { productionSetupService, durableStorageOpsService } from '@doodle-dash/production';
import { ProductionSetupClient } from '@/components/ProductionSetupClient';
import { PreviewProductionSetup } from '@/components/preview/PreviewProductionSetup';
import { isPublicWebsitePreview } from '@/lib/public-preview';

export const dynamic = 'force-dynamic';

export default async function ProductionSetupPage() {
  if (isPublicWebsitePreview()) {
    return <PreviewProductionSetup />;
  }

  const [checklist, blender, storage] = await Promise.all([
    productionSetupService.buildChecklist(),
    productionSetupService.blenderPanel(),
    durableStorageOpsService.health(),
  ]);

  return (
    <ProductionSetupClient
      initialChecklist={checklist}
      initialBlender={blender}
      initialStorage={storage}
    />
  );
}

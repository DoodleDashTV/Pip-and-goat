import { productionSetupService, durableStorageOpsService } from '@doodle-dash/production';
import { ProductionSetupClient } from '@/components/ProductionSetupClient';

export const dynamic = 'force-dynamic';

export default async function ProductionSetupPage() {
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

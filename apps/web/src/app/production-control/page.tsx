import { ProductionStudioConsole } from '@/components/preview/ProductionStudioConsole';
import { buildPreviewPersistenceConsoleModel } from '@/lib/tivvlejoy-production-persistence/console-model';
import { buildPreviewStudioConsoleModel } from '@/lib/tivvlejoy-production-studio/console-model';
import { compileRealProductionUnblock } from '@/lib/tivvlejoy-real-production-unblock/compile';
import {
  buildFirstEpisodeOperatorModel,
  fallbackFirstEpisodeOperatorModel,
  fallbackFirstEpisodeVoiceHandoffModel,
} from '@/lib/tivvlejoy-real-production-unblock/console-model';

export const dynamic = 'force-dynamic';

export default async function ProductionControlPage() {
  const model = buildPreviewStudioConsoleModel();
  const persistence = buildPreviewPersistenceConsoleModel();
  const firstEpisode = await compileRealProductionUnblock({ authorizeReads: false })
    .then(buildFirstEpisodeOperatorModel)
    .catch(() => fallbackFirstEpisodeOperatorModel());
  const voiceHandoff = fallbackFirstEpisodeVoiceHandoffModel();
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <ProductionStudioConsole
        model={model}
        persistence={persistence}
        firstEpisode={firstEpisode}
        voiceHandoff={voiceHandoff}
      />
    </main>
  );
}

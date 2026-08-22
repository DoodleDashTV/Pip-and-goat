import { ProductionStudioConsole } from '@/components/preview/ProductionStudioConsole';
import '@/lib/voice-production/durable-voice-ledger-postgres';
import { buildPreviewPersistenceConsoleModel } from '@/lib/tivvlejoy-production-persistence/console-model';
import { buildPreviewStudioConsoleModel } from '@/lib/tivvlejoy-production-studio/console-model';
import { compileRealProductionUnblock } from '@/lib/tivvlejoy-real-production-unblock/compile';
import {
  buildFirstEpisodeOperatorModel,
  fallbackFirstEpisodeOperatorModel,
  reconcileFirstEpisodeVoiceHandoff,
} from '@/lib/tivvlejoy-real-production-unblock/console-model';
import {
  runEp012VoiceProductionHandoff,
  unavailableEp012VoiceProductionHandoff,
} from '@/lib/tivvlejoy-real-production-unblock/ep012-voice-production-handoff';

export const dynamic = 'force-dynamic';

export default async function ProductionControlPage() {
  const model = buildPreviewStudioConsoleModel();
  const persistence = buildPreviewPersistenceConsoleModel();
  const [baseFirstEpisode, handoff] = await Promise.all([
    compileRealProductionUnblock({ authorizeReads: false })
      .then(buildFirstEpisodeOperatorModel)
      .catch(() => fallbackFirstEpisodeOperatorModel()),
    runEp012VoiceProductionHandoff().catch(() => unavailableEp012VoiceProductionHandoff()),
  ]);
  const { firstEpisode, voiceHandoff } = reconcileFirstEpisodeVoiceHandoff(baseFirstEpisode, handoff);
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

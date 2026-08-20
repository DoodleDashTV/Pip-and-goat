import { EpisodePreflightConsole } from '@/components/preview/EpisodePreflightConsole';
import { compileRealInputConvergence } from '@/lib/tivvlejoy-real-input-convergence/compile';
import { buildRealInputConsoleModel } from '@/lib/tivvlejoy-real-input-convergence/console-model';

export const dynamic = 'force-dynamic';

export default async function EpisodePreflightPage() {
  const report = await compileRealInputConvergence({ authorizeReads: false });
  const model = buildRealInputConsoleModel(report, 'REAL_PROJECT_STATUS');
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <EpisodePreflightConsole model={model} />
    </main>
  );
}

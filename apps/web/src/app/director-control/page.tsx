import { DirectorControlConsole } from '@/components/preview/DirectorControlConsole';
import { buildNightshiftConsoleModel } from '@/lib/tivvlejoy-nightshift-production/console-model';

export const dynamic = 'force-dynamic';

export default function DirectorControlPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <DirectorControlConsole model={buildNightshiftConsoleModel()} />
    </main>
  );
}

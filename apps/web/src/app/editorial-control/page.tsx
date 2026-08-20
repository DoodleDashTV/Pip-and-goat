import { EditorialControlConsole } from '@/components/preview/EditorialControlConsole';
import { buildNightshiftConsoleModel } from '@/lib/tivvlejoy-nightshift-production/console-model';

export const dynamic = 'force-dynamic';

export default function EditorialControlPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <EditorialControlConsole model={buildNightshiftConsoleModel()} />
    </main>
  );
}

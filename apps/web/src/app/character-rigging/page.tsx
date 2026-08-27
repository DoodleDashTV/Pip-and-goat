import { CharacterRiggingConsole } from '@/components/preview/CharacterRiggingConsole';
import { buildGoatSourceIntakeConsoleModel } from '@/lib/tivvlejoy-character-source-intake/console-model';

export const dynamic = 'force-dynamic';

export default function CharacterRiggingPage() {
  const model = buildGoatSourceIntakeConsoleModel();
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <CharacterRiggingConsole model={model} />
    </main>
  );
}

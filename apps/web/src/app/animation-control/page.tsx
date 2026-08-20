import { AnimationControlConsole } from '@/components/preview/AnimationControlConsole';
import { buildAnimationConsoleModel } from '@/lib/tivvlejoy-character-animation/console-model';

export const dynamic = 'force-dynamic';

export default function AnimationControlPage() {
  const model = buildAnimationConsoleModel();
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <AnimationControlConsole model={model} />
    </main>
  );
}

import { SceneryLongevityPreview } from '@/components/preview/SceneryLongevityPreview';

export const dynamic = 'force-dynamic';

export default function WorldBuilderLongevityPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <SceneryLongevityPreview />
    </main>
  );
}

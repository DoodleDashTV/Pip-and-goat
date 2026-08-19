import { ApprovedAssetRegistryPreview } from '@/components/preview/ApprovedAssetRegistryPreview';

export const dynamic = 'force-dynamic';

export default function WorldBuilderAssetsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <ApprovedAssetRegistryPreview />
    </main>
  );
}

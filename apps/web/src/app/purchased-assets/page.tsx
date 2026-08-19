import { PurchasedToolsIphoneIntake } from '@/components/preview/PurchasedToolsIphoneIntake';

export const dynamic = 'force-dynamic';

export default function PurchasedAssetsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <PurchasedToolsIphoneIntake />
    </main>
  );
}

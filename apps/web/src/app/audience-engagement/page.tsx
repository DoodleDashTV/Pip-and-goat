import { AudienceEngagementConsole } from '@/components/preview/AudienceEngagementConsole';
import { buildAudienceEngagementConsoleModel } from '@/lib/tivvlejoy-kids-engagement';

export const dynamic = 'force-dynamic';

export default function AudienceEngagementPage() {
  const model = buildAudienceEngagementConsoleModel();
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <AudienceEngagementConsole model={model} />
    </main>
  );
}

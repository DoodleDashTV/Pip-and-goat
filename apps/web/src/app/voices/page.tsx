import { PreviewVoices } from '@/components/preview/PreviewVoices';
import { VoicesProductionClient } from '@/components/VoicesProductionClient';
import { isPublicWebsitePreview } from '@/lib/public-preview';

export const dynamic = 'force-dynamic';

export default function VoicesPage() {
  if (isPublicWebsitePreview()) {
    return <PreviewVoices />;
  }
  return <VoicesProductionClient />;
}

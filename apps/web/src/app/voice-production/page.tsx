import { VoiceProductionStudio } from '@/components/preview/VoiceProductionStudio';
import { isPublicWebsitePreview } from '@/lib/public-preview';

export const dynamic = 'force-dynamic';

export default function VoiceProductionPage() {
  const publicPreview = isPublicWebsitePreview();
  return <VoiceProductionStudio publicPreview={publicPreview} />;
}

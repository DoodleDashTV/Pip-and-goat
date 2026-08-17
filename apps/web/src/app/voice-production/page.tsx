import { VoiceProductionStudio } from '@/components/preview/VoiceProductionStudio';
import { isPublicWebsitePreview } from '@/lib/public-preview';
import { publicLiveTestSnapshot } from '@/lib/voice-production/candidate-gates';
import { publicScriptToVoiceSnapshot } from '@/lib/voice-production/script-to-voice';

export const dynamic = 'force-dynamic';

export default function VoiceProductionPage() {
  const publicPreview = isPublicWebsitePreview();
  const scriptToVoice = publicScriptToVoiceSnapshot();
  const liveTest = publicLiveTestSnapshot();
  return (
    <VoiceProductionStudio
      publicPreview={publicPreview}
      scriptToVoice={scriptToVoice}
      liveTest={liveTest}
    />
  );
}

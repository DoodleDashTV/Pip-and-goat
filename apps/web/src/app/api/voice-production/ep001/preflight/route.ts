import { NextResponse } from 'next/server';
import { ep012AudioStorageConfigured } from '@/lib/tivvlejoy-real-production-unblock/ep012-audio-storage';
import { lockedVoiceIdFor } from '@/lib/voice-production/voice-identity';

export const dynamic = 'force-dynamic';

function canResolveLockedVoice(characterId: 'CHAR_PIP_001' | 'CHAR_GOAT_001'): boolean {
  try {
    return Boolean(lockedVoiceIdFor(characterId));
  } catch {
    return false;
  }
}

export async function GET() {
  const previewRuntime = process.env.VERCEL_ENV === 'preview';
  const elevenLabsApiKeyConfigured = Boolean(String(process.env.ELEVENLABS_API_KEY ?? '').trim());
  const r2Configured = ep012AudioStorageConfigured(process.env);
  const pipVoiceLocked = canResolveLockedVoice('CHAR_PIP_001');
  const goatVoiceLocked = canResolveLockedVoice('CHAR_GOAT_001');
  const readyForGuardedExecution = previewRuntime && elevenLabsApiKeyConfigured && r2Configured && pipVoiceLocked && goatVoiceLocked;

  return NextResponse.json({
    schemaVersion: 'TIVVLEJOY_EP001_CONNECTED_VOICE_PREFLIGHT_V1',
    episodeId: 'EP001',
    previewRuntime,
    elevenLabsApiKeyConfigured,
    r2Configured,
    pipVoiceLocked,
    goatVoiceLocked,
    readyForGuardedExecution,
    providerContacted: false,
    providerRequestsMade: 0,
    storageMutations: 0,
    productionMutations: 0,
    paidRequests: 0,
  }, { status: readyForGuardedExecution ? 200 : 503 });
}

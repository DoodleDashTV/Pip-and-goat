import { NextResponse } from 'next/server';
import { ep012AudioStorageConfigured } from '@/lib/tivvlejoy-real-production-unblock/ep012-audio-storage';
import { lockedVoiceIdFor } from '@/lib/voice-production/voice-identity';

export const dynamic = 'force-dynamic';

export async function GET() {
  let pipVoiceLocked = false;
  let goatVoiceLocked = false;
  try { pipVoiceLocked = Boolean(lockedVoiceIdFor('CHAR_PIP_001')); } catch {}
  try { goatVoiceLocked = Boolean(lockedVoiceIdFor('CHAR_GOAT_001')); } catch {}
  const result = {
    schemaVersion: 'TIVVLEJOY_EP001_TEMP_STORAGE_PREFLIGHT_V1',
    previewRuntime: process.env.VERCEL_ENV === 'preview',
    elevenLabsApiKeyConfigured: Boolean(String(process.env.ELEVENLABS_API_KEY ?? '').trim()),
    r2Configured: ep012AudioStorageConfigured(process.env),
    pipVoiceLocked,
    goatVoiceLocked,
    providerContacted: false,
    providerRequestsMade: 0,
    storageMutations: 0,
    paidRequests: 0,
  };
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
}

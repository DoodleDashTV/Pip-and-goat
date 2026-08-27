import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { APPROVED_ELEVENLABS_MODEL, APPROVED_OUTPUT_FORMAT } from '@/lib/voice-production/approved-voice-settings';
import { lockedVoiceIdFor, lockedVoiceIdsAreDistinct } from '@/lib/voice-production/voice-identity';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID } from '@/lib/voice-production/types';
import { ep012AudioStorageConfigured } from '@/lib/tivvlejoy-real-production-unblock/ep012-audio-storage';

const lines = [
  ['EP001_DL_01', PIP_CHARACTER_ID, 'Goat, look! A doodle map—with a piece missing.', '5aa3981ca11ef611f69ff006df583e574bbbb6f4876094971f1fe2b15cec2552'],
  ['EP001_DL_02', GOAT_CHARACTER_ID, 'Maybe the wind knows where it went.', '8e5cfb14399a49f0ff53cea910b4eea82b3337f1dd56b2af1ea9667e65b5ce92'],
  ['EP001_DL_03', PIP_CHARACTER_ID, "Then let's follow that flutter!", 'a75eda2549085ee1f10b5e051028718e394759b53e9b926edd59aa2622a3ff49'],
  ['EP001_DL_04', GOAT_CHARACTER_ID, 'I can look low!', '981e7dcc7a2d54698b0465321193fb1c9ac6b07ec5f2ed2a24250842c9db0577'],
  ['EP001_DL_05', PIP_CHARACTER_ID, 'And I can look high!', 'd98d190e26df2a0a461fe859779ba3521f9d9fa2ba14a3e05c529b3928743d81'],
  ['EP001_DL_06', PIP_CHARACTER_ID, 'Together, we found it!', 'a6fc56558385250b0b179f9123ce592935267e89222281a3f87fc4770ae13516'],
  ['EP001_DL_07', GOAT_CHARACTER_ID, 'It drew a brand-new path!', '666945474add51211d80c5f9611bd80cd005f6de44b0e854733f5da4b40b28e5'],
  ['EP001_DL_08', PIP_CHARACTER_ID, 'Adventure first. Snack second?', 'cc57e843f7d540ff96ab4b48cff0f976b661d3dea723a8abc69e3e14b9ab4502'],
] as const;

const textSha = (text: string) => createHash('sha256').update(JSON.stringify({ text })).digest('hex');
const voiceHash = (characterId: typeof PIP_CHARACTER_ID | typeof GOAT_CHARACTER_ID) => createHash('sha256').update(lockedVoiceIdFor(characterId)).digest('hex');

export async function GET() {
  const rows = lines.map(([lineId, characterId, text, expectedTextSha256]) => ({
    lineId,
    characterId,
    textIdentityVerified: textSha(text) === expectedTextSha256,
    textSha256: expectedTextSha256,
    voiceIdSha256: voiceHash(characterId),
  }));
  const body = {
    schemaVersion: 'TIVVLEJOY_EP001_TEMP_EXECUTION_READINESS_V1',
    episodeId: 'EP001',
    previewRuntime: process.env.VERCEL_ENV === 'preview',
    elevenLabsApiKeyConfigured: Boolean(String(process.env.ELEVENLABS_API_KEY ?? '').trim()),
    r2Configured: ep012AudioStorageConfigured(process.env),
    voiceIdsDistinct: lockedVoiceIdsAreDistinct(),
    modelId: APPROVED_ELEVENLABS_MODEL,
    outputFormat: APPROVED_OUTPUT_FORMAT,
    lineCount: rows.length,
    allTextIdentitiesVerified: rows.every((row) => row.textIdentityVerified),
    rows,
    paidAuthorizationPinned: false,
    readyForPaidExecution: false,
    providerContacted: false,
    providerRequestsMade: 0,
    paidRequests: 0,
    storageMutations: 0,
    productionMutations: 0,
  };
  return NextResponse.json(body, { status: 200, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
}

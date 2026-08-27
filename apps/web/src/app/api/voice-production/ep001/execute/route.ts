import { NextResponse } from 'next/server';
import { executeOneEp001VoiceLine } from '@/lib/tivvlejoy-ep001-connected-voice-execution';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const lineId = url.searchParams.get('line') ?? '';
  try {
    const result = await executeOneEp001VoiceLine({ token, lineId });
    const status = result.ok ? 200 : 400;
    return NextResponse.json(result, {
      status,
      headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  } catch {
    return NextResponse.json({
      schemaVersion: 'TIVVLEJOY_EP001_CONNECTED_VOICE_EXECUTION_V1',
      ok: false,
      status: 'BLOCKED',
      episodeId: 'EP001',
      lineId: null,
      blockers: ['EP001_EXECUTION_FAILED_CLOSED'],
      providerContacted: false,
      providerRequestsMade: 0,
      storageVerified: false,
      humanApproved: false,
      productionEnabled: false,
    }, { status: 400, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
  }
}

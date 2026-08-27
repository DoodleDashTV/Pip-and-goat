import { NextResponse } from 'next/server';
import { compileEp001RigDeliveryUploadShell } from '@/lib/tivvlejoy-ep001-rig-delivery-upload-shell';

export async function GET() {
  return NextResponse.json(compileEp001RigDeliveryUploadShell(), {
    status: 200,
    headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

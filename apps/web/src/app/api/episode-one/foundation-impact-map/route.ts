import { NextResponse } from 'next/server';
import { compileEp001FoundationImpactMap } from '@/lib/tivvlejoy-ep001-foundation-impact-map';

export async function GET() {
  return NextResponse.json(compileEp001FoundationImpactMap(), {
    status: 200,
    headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

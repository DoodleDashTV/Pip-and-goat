import { NextResponse } from 'next/server';
import {
  TIVVLEJOY_RIG_ADAPTER_TOKEN_HEADER,
  handleRigAdapterReceipt,
  publicRigAdapterReceiptStatus,
} from '@/lib/tivvlejoy-rig-control-adapter-receipt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : 'RIG_ADAPTER_RECEIPT_REFUSED';
  const unauthorized = code === 'RIG_ADAPTER_RECEIPT_UNAUTHORIZED' || code === 'RIG_ADAPTER_RECEIPT_PREVIEW_REQUIRED';
  return NextResponse.json(
    {
      schemaVersion: 'TIVVLEJOY_RIG_CONTROL_ADAPTER_RECEIPT_V1',
      error: unauthorized ? 'Rig adapter receipt authorization refused.' : 'Rig adapter receipt request refused.',
      code,
      persisted: false,
      humanApproved: false,
      productionEnabled: false,
    },
    { status: unauthorized ? 401 : 400, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } },
  );
}

export async function GET() {
  return NextResponse.json(publicRigAdapterReceiptStatus(process.env), {
    status: 200,
    headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export async function POST(request: Request) {
  const token = request.headers.get(TIVVLEJOY_RIG_ADAPTER_TOKEN_HEADER) ?? '';
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '') as Parameters<typeof handleRigAdapterReceipt>[0]['action'];
    const result = await handleRigAdapterReceipt({ action, body, token, env: process.env });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  } catch (error) {
    return failure(error);
  }
}

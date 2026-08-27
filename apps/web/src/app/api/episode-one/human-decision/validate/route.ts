import { NextResponse } from 'next/server';
import {
  validateEp001HumanDecisionReceipt,
  type Ep001HumanDecisionReceiptInput,
} from '@/lib/tivvlejoy-ep001-human-decision-receipt';

export async function POST(request: Request) {
  let payload: Ep001HumanDecisionReceiptInput;
  try {
    payload = (await request.json()) as Ep001HumanDecisionReceiptInput;
  } catch {
    return NextResponse.json(
      {
        schemaVersion: 'TIVVLEJOY_EP001_HUMAN_DECISION_VALIDATION_ROUTE_V1',
        success: false,
        structurallyValid: false,
        issues: ['INVALID_JSON'],
        authority: {
          approvalRecorded: false,
          evidenceAdmissionGranted: false,
          paidRenderAuthorized: false,
          productionWritesAllowed: false,
        },
      },
      { status: 400, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } },
    );
  }

  const result = validateEp001HumanDecisionReceipt(payload);
  return NextResponse.json(
    {
      success: true,
      ...result,
    },
    {
      status: result.structurallyValid ? 200 : 422,
      headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
    },
  );
}

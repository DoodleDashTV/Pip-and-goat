import { NextResponse } from 'next/server';
import { prepareEp001HumanDecisionReceipt } from '@/lib/tivvlejoy-ep001-human-decision-preparer';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const prepared = prepareEp001HumanDecisionReceipt({
      decisionId: String(body.decisionId ?? ''),
      decision: String(body.decision ?? '') as 'APPROVED' | 'REJECTED',
      reviewerId: String(body.reviewerId ?? ''),
      reviewedAt: String(body.reviewedAt ?? ''),
      evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.map(String) : [],
    });
    return NextResponse.json(prepared, { status: prepared.validation.structurallyValid ? 200 : 422, headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'HUMAN_DECISION_PREPARATION_FAILED', approvalRecorded: false, paidExecutionAuthorized: false }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { durableStorageOpsService } from '@doodle-dash/production';
import { AppError } from '@doodle-dash/shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const health = await durableStorageOpsService.health();
    return NextResponse.json({ storage: health });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'self-test');
    if (action === 'self-test') {
      const result = await durableStorageOpsService.selfTest();
      const health = await durableStorageOpsService.health();
      return NextResponse.json({ result, storage: health });
    }
    if (action === 'migrate-local') {
      const report = await durableStorageOpsService.migrateLocalToConfiguredStorage({
        dryRun: Boolean(body.dryRun),
        limit: typeof body.limit === 'number' ? body.limit : 500,
      });
      return NextResponse.json({ report });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}

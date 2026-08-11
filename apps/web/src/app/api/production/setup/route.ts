import { NextResponse } from 'next/server';
import {
  durableStorageOpsService,
  blenderWorkerHealthService,
  productionSetupService,
} from '@doodle-dash/production';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [checklist, blender, storage] = await Promise.all([
      productionSetupService.buildChecklist(),
      productionSetupService.blenderPanel(),
      durableStorageOpsService.health(),
    ]);
    return NextResponse.json({ checklist, blender, storage });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || '');
    if (action === 'storage-self-test') {
      const result = await durableStorageOpsService.selfTest();
      const checklist = await productionSetupService.buildChecklist();
      return NextResponse.json({ result, checklist });
    }
    if (action === 'blender-self-test') {
      const test = await blenderWorkerHealthService.runSelfTest();
      const blender = await productionSetupService.blenderPanel();
      const checklist = await productionSetupService.buildChecklist();
      return NextResponse.json({ test, blender, checklist });
    }
    if (action === 'export-modeling-package') {
      const code = z.enum([FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT]).parse(body.characterCode);
      const exported = await productionSetupService.exportModelingPackage(code);
      return NextResponse.json({
        exported,
        download: {
          json: exported.package,
          markdown: productionSetupService.modelingPackageMarkdown(exported.package),
          storageKeys: {
            json: exported.json.storageKey,
            markdown: exported.markdown.storageKey,
          },
        },
      });
    }
    if (action === 'checklist') {
      return NextResponse.json(await productionSetupService.buildChecklist());
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}

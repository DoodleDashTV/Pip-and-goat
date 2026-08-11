import { NextResponse } from 'next/server';
import {
  canonicalCharacterService,
  accessoryContinuityGuardian,
} from '@doodle-dash/production';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { AppError } from '@doodle-dash/shared';
import { z } from 'zod';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? FOUNDING_CODES.PIP;
  await canonicalCharacterService.bootstrapFoundingCharacters();
  const readiness = await canonicalCharacterService.readinessMatrix(code);
  return NextResponse.json({ readiness, style: true });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'file required' }, { status: 400 });
      }
      const characterCode = String(form.get('characterCode') || '');
      const autoApprove = String(form.get('autoApprove') || 'false') === 'true';
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await canonicalCharacterService.ingestPrimaryCanonicalReference({
        characterCode,
        fileName: file.name,
        bytes,
        contentType: file.type || 'image/jpeg',
        autoApprove,
        approvedBy: String(form.get('approvedBy') || 'studio-operator'),
      });
      return NextResponse.json(result, { status: 201 });
    }

    const body = await request.json();
    const action = body.action as string;
    if (action === 'bootstrap') {
      return NextResponse.json(await canonicalCharacterService.bootstrapFoundingCharacters());
    }
    if (action === 'lock-dna') {
      const code = z.enum([FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT]).parse(body.characterCode);
      return NextResponse.json(await canonicalCharacterService.lockVisualDna(code));
    }
    if (action === 'approve-primary') {
      const parsed = z
        .object({
          characterCode: z.enum([FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT]),
          referenceImageId: z.string().uuid(),
          approvedBy: z.string().min(1),
        })
        .parse(body);
      const version = await canonicalCharacterService.approvePrimaryCanonical(parsed);
      return NextResponse.json({ version });
    }
    if (action === 'reject-primary') {
      const parsed = z
        .object({
          characterCode: z.enum([FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT]),
          referenceImageId: z.string().uuid(),
          rejectedBy: z.string().min(1).default('studio-operator'),
          reason: z.string().optional(),
        })
        .parse(body);
      const image = await canonicalCharacterService.rejectPrimaryCandidate(parsed);
      return NextResponse.json({ image });
    }
    if (action === 'accessory-continuity') {
      const episodeId = z.string().uuid().parse(body.episodeId);
      return NextResponse.json(await accessoryContinuityGuardian.evaluateEpisode(episodeId));
    }
    if (action === 'readiness') {
      const code = z.enum([FOUNDING_CODES.PIP, FOUNDING_CODES.GOAT]).parse(body.characterCode);
      return NextResponse.json({
        readiness: await canonicalCharacterService.readinessMatrix(code),
      });
    }
    if (action === 'text-only-forbidden') {
      canonicalCharacterService.assertNotTextOnlyCharacterGeneration();
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}

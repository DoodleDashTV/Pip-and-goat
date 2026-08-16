import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';
import { episodeService } from '@doodle-dash/story';
import { evaluateEpisodeCreateSafety } from '@doodle-dash/preproduction';
import { z } from 'zod';

const BodySchema = z.object({
  title: z.string().trim().min(1),
  premise: z.string().trim().min(1),
  targetDurationSec: z.coerce.number().int().refine((n) => [15, 30, 45, 60].includes(n), {
    message: 'Duration must be 15, 30, 45, or 60 seconds',
  }),
});

export async function POST(request: Request) {
  const raw = (await request.json()) as Record<string, unknown>;
  const safety = evaluateEpisodeCreateSafety({
    command: 'create-episode',
    intent:
      raw.intent === 'FINAL' || raw.intent === 'THEATRICAL' || raw.intent === 'PUBLISH' || raw.intent === 'DRAFT'
        ? raw.intent
        : 'DRAFT',
    characterMode:
      raw.characterMode === 'PROXY' || raw.characterMode === 'CANONICAL' ? raw.characterMode : undefined,
    characterCodes: Array.isArray(raw.characterCodes) ? raw.characterCodes.map(String) : undefined,
    allowPaidGpu: raw.allowPaidGpu === true,
    writeProductionLibrary: raw.writeProductionLibrary === true,
  });
  if (!safety.allowed) {
    return NextResponse.json(
      { error: safety.reason, code: safety.code, safety },
      { status: 409 },
    );
  }

  const body = BodySchema.parse(raw);
  const universe = await prisma.universe.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!universe) {
    return NextResponse.json({ error: 'No active universe' }, { status: 404 });
  }

  const last = await prisma.episode.findFirst({
    where: { universeId: universe.id, seasonId: null },
    orderBy: { episodeNumber: 'desc' },
  });
  const episodeNumber = (last?.episodeNumber ?? 0) + 1;

  const episode = await episodeService.create({
    universeId: universe.id,
    episodeNumber,
    title: body.title,
    logline: body.premise.slice(0, 280),
    synopsis: body.premise,
    status: 'DRAFT',
  });

  await prisma.episode.update({
    where: { id: (episode as { id: string }).id },
    data: { durationSec: body.targetDurationSec },
  });

  const id = (episode as { id: string }).id;
  return NextResponse.json({
    episode,
    episodeId: id,
    redirectTo: `/episodes/${id}`,
    message: 'Episode created. Generate and approve the story next.',
  });
}

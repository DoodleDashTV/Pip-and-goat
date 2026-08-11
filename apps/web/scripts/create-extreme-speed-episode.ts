/**
 * Create the EXTREME SPEED acceptance episode — Pip + Goat, 5 shots, ~12s.
 * Idempotent upsert against a dedicated episode id.
 */
import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { characterService } from '@doodle-dash/characters';

export const EXTREME_SPEED_EPISODE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function main() {
  const pip = await characterService.getByCode(FOUNDING_CODES.PIP);
  const goat = await characterService.getByCode(FOUNDING_CODES.GOAT);
  const meadow = await prisma.location.findFirstOrThrow({ where: { internalCode: 'LOC_MEADOW_001' } });
  const template = await prisma.episode.findFirstOrThrow({
    where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  });

  const episode = await prisma.episode.upsert({
    where: { id: EXTREME_SPEED_EPISODE_ID },
    update: {
      title: '[ACCEPTANCE] Extreme Speed — Pip + Goat Meadow Dash',
      logline:
        'Diagnostic multi-shot Pip + Goat episode for dirty-shot cache + FINAL_1080P acceptance. Not Season 1 canon.',
      durationSec: 12,
      status: 'APPROVED',
    },
    create: {
      id: EXTREME_SPEED_EPISODE_ID,
      seasonId: template.seasonId,
      universeId: template.universeId,
      title: '[ACCEPTANCE] Extreme Speed — Pip + Goat Meadow Dash',
      logline:
        'Diagnostic multi-shot Pip + Goat episode for dirty-shot cache + FINAL_1080P acceptance. Not Season 1 canon.',
      episodeNumber: 9902,
      durationSec: 12,
      status: 'APPROVED',
    },
  });

  const scene = await prisma.scene.upsert({
    where: {
      episodeId_sceneNumber: { episodeId: episode.id, sceneNumber: 1 },
    },
    update: {
      title: 'Meadow clue chase',
      description: 'Pip and Goat chase a glowing clue across Sunny Meadow.',
      locationId: meadow.id,
      characterIds: [pip.id, goat.id],
      durationSec: 12,
      lightingPreset: 'sunnyPlayroom',
    },
    create: {
      episodeId: episode.id,
      sceneNumber: 1,
      title: 'Meadow clue chase',
      description: 'Pip and Goat chase a glowing clue across Sunny Meadow.',
      locationId: meadow.id,
      characterIds: [pip.id, goat.id],
      emotionalBeat: 'curiosity',
      durationSec: 12,
      lightingPreset: 'sunnyPlayroom',
    },
  });

  const shots = [
    {
      n: 1,
      dur: 2.5,
      cam: 'storyWide',
      desc: 'Wide establishing: Pip and Goat enter a colorful meadow.',
      actions: { pip: 'PIP_WALK', goat: 'GOAT_WALK' },
    },
    {
      n: 2,
      dur: 2.5,
      cam: 'storyTracking',
      desc: 'Medium tracking: Pip notices a glowing clue on the path.',
      actions: { pip: 'PIP_LOOK', goat: 'GOAT_IDLE' },
    },
    {
      n: 3,
      dur: 2.5,
      cam: 'storyMedium',
      desc: 'Goat walks over, reacts, and points toward the next clue.',
      actions: { pip: 'PIP_IDLE', goat: 'GOAT_POINT' },
    },
    {
      n: 4,
      dur: 2.5,
      cam: 'storyTracking',
      desc: 'Pip and Goat run toward the clue together.',
      actions: { pip: 'PIP_RUN', goat: 'GOAT_RUN' },
    },
    {
      n: 5,
      dur: 2.0,
      cam: 'storyClose',
      desc: 'Close-up end beat: they discover something mysterious on the map.',
      actions: { pip: 'PIP_SURPRISED', goat: 'GOAT_SURPRISED' },
    },
  ];

  for (const s of shots) {
    await prisma.shot.upsert({
      where: { sceneId_shotNumber: { sceneId: scene.id, shotNumber: s.n } },
      update: {
        description: s.desc,
        durationSeconds: s.dur,
        cameraPreset: s.cam,
        lightingPreset: 'sunnyPlayroom',
        characterIds: [pip.id, goat.id],
        productionNotes: JSON.stringify({ actions: s.actions, acceptance: true }),
        status: 'READY',
      },
      create: {
        sceneId: scene.id,
        shotNumber: s.n,
        description: s.desc,
        durationSeconds: s.dur,
        cameraPreset: s.cam,
        lightingPreset: 'sunnyPlayroom',
        characterIds: [pip.id, goat.id],
        productionNotes: JSON.stringify({ actions: s.actions, acceptance: true }),
        status: 'READY',
      },
    });
  }

  await prisma.dialogueLine.deleteMany({ where: { episodeId: episode.id } });
  const lines = [
    { speakerId: pip.id, text: 'Look, Goat! A glowing clue!', startMs: 2500, endMs: 4500 },
    { speakerId: goat.id, text: 'This way, Pip!', startMs: 5000, endMs: 7000 },
    { speakerId: pip.id, text: 'Let us go!', startMs: 7500, endMs: 9000 },
    { speakerId: goat.id, text: 'Mystery map!', startMs: 10000, endMs: 11500 },
  ];
  for (const line of lines) {
    await prisma.dialogueLine.create({
      data: {
        episodeId: episode.id,
        speakerId: line.speakerId,
        text: line.text,
        startMs: line.startMs,
        endMs: line.endMs,
        emotion: 'excited',
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        episodeId: episode.id,
        title: episode.title,
        shots: shots.length,
        durationSec: 12,
        characters: [pip.internalCode, goat.internalCode],
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { prisma } from '@doodle-dash/database';
import { VERTICAL_SLICE_EPISODE_ID } from '@doodle-dash/production';

async function main() {
  const ep = await prisma.episode.findUnique({
    where: { id: VERTICAL_SLICE_EPISODE_ID },
    include: {
      scenes: { include: { shots: true, location: true }, orderBy: { sceneNumber: 'asc' } },
      dialogues: true,
      season: true,
    },
  });
  console.log(
    JSON.stringify(
      {
        id: ep?.id,
        title: ep?.title,
        status: ep?.status,
        seasonApproved: ep?.season?.approvedForProduction,
        scenes: ep?.scenes.map((s) => ({
          n: s.sceneNumber,
          title: s.title,
          location: s.location?.internalCode,
          duration: s.durationSec,
          shots: s.shots.map((sh) => ({
            n: sh.shotNumber,
            dur: sh.durationSeconds,
            cam: sh.cameraPreset,
            chars: sh.characterIds,
            desc: sh.description.slice(0, 80),
          })),
        })),
        dialogues: ep?.dialogues?.map((d) => ({
          characterId: d.characterId,
          text: d.text?.slice(0, 80),
          startMs: d.startMs,
        })),
      },
      null,
      2,
    ),
  );

  const intakes = await prisma.productionAssetIntake.findMany({
    where: {
      OR: [
        { kind: { in: ['CHARACTER_BLEND', 'LOCATION_BLEND', 'PROP_BLEND'] } },
        { entityType: { in: ['character', 'location', 'prop'] } },
      ],
      storageLocation: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  console.log(
    'intakes',
    intakes.map((i) => ({
      kind: i.kind,
      entity: i.entityId.slice(0, 8),
      uri: i.storageLocation?.slice(0, 80),
      ready: i.productionReady,
    })),
  );
}

main().finally(() => prisma.$disconnect());

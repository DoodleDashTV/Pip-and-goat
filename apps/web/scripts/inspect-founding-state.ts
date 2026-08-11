import { prisma } from '@doodle-dash/database';

async function main() {
  for (const code of ['CHAR_PIP_001', 'CHAR_GOAT_001']) {
    const c = await prisma.character.findFirst({
      where: { internalCode: code },
      include: { facialRigs: true, referenceImages: true, models: true, rigs: true },
    });
    console.log(
      JSON.stringify(
        {
          code,
          facial: c?.facialRigs.map((f) => ({
            id: f.id,
            approved: f.approved,
            status: f.status,
            visemes: f.visemes,
          })),
          refs: c?.referenceImages.map((r) => ({
            id: r.id,
            primary: r.isPrimary,
            status: r.reviewStatus,
            assetId: r.assetId,
          })),
          models: c?.models.map((m) => ({
            id: m.id,
            status: m.status,
            approved: m.approved,
            productionReady: m.productionReady,
            facialRigId: m.facialRigId,
          })),
          voice: await prisma.voiceProductionConfig.findUnique({
            where: { characterId: c!.id },
          }),
          facialMaps: await prisma.characterFacialControlMap.findMany({
            where: { characterId: c!.id },
          }),
        },
        null,
        2,
      ),
    );
  }
}

main().finally(() => prisma.$disconnect());

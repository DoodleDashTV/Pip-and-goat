import { buildEpisodeOrchestrator, episodeReadinessAggregator, blenderWorkerHealthService, VERTICAL_SLICE_EPISODE_ID } from '@doodle-dash/production';
import { prisma } from '@doodle-dash/database';

async function main() {
  const run = await buildEpisodeOrchestrator.start({
    episodeId: VERTICAL_SLICE_EPISODE_ID,
    durationTargetSec: 30,
  });
  console.log('PIPELINE_STATUS', run.status);
  for (const s of run.stages) {
    console.log(`${s.stage}:${s.status}${s.blockedReason ? ` — ${s.blockedReason}` : ''}`);
  }
  const checklist = await episodeReadinessAggregator.buildChecklist(VERTICAL_SLICE_EPISODE_ID);
  console.log(
    'CHECKLIST',
    checklist.items.map((i) => `${i.category}:${i.state}`).join(', '),
  );
  const blender = await blenderWorkerHealthService.status();
  console.log(
    'BLENDER',
    blender.blender.available ? blender.blender.version : 'BLENDER EXECUTION REQUIRED',
  );
  const selfTest = await blenderWorkerHealthService.runSelfTest();
  console.log('SELF_TEST', selfTest.status, selfTest.error || selfTest.artifactUri || selfTest.logExcerpt);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

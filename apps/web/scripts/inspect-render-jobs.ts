import { prisma } from '@doodle-dash/database';

async function main() {
  const jobs = await prisma.renderJob.findMany({
    where: { episodeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    orderBy: { createdAt: 'asc' },
    include: { outputs: true },
  });
  console.log(
    jobs.map((j) => ({
      id: j.id.slice(0, 8),
      status: j.status,
      progress: j.progress,
      res: j.resolution,
      shot: j.shotId?.slice(0, 8),
      err: j.error?.slice(0, 120),
      outputs: j.outputs.length,
      started: j.startedAt,
      completed: j.completedAt,
    })),
  );
}

main().finally(() => prisma.$disconnect());

import { prisma } from '@doodle-dash/database';
import { resolveCloudCostLimitsFromEnv } from '@doodle-dash/production';

export const dynamic = 'force-dynamic';

function mapStage(status: string, meta: Record<string, unknown>) {
  if (typeof meta.cloudStage === 'string') return meta.cloudStage;
  switch (status) {
    case 'QUEUED':
      return 'Queued';
    case 'PREPARING':
      return 'Preparing assets';
    case 'RENDERING':
      return 'Rendering';
    case 'ENCODING':
      return 'Encoding';
    case 'QUALITY_CHECK':
      return 'QC';
    case 'COMPLETE':
      return 'Complete';
    case 'FAILED':
      return 'Failed';
    case 'CANCELLED':
      return 'Failed';
    default:
      return status;
  }
}

export default async function Page() {
  const limits = resolveCloudCostLimitsFromEnv();
  const rows = await prisma.renderJob.findMany({
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Render</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Render Queue</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Local Blender remains the default path. Cloud (Runpod) stays off until explicitly enabled.
          Cloud render enabled: {limits.cloudRenderEnabled ? 'yes' : 'no'} · Paid GPU launch:{' '}
          {limits.allowPaidGpuLaunch ? 'allowed' : 'blocked'} · Idle shutdown:{' '}
          {limits.idleShutdownMinutes}m
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => {
          const meta =
            ((row.payload as { metadata?: Record<string, unknown> } | null)?.metadata as Record<
              string,
              unknown
            >) ?? {};
          const stage = mapStage(row.status, meta);
          const provider =
            typeof meta.provider === 'string' ? meta.provider : row.renderMode ?? 'LOCAL';
          const estimated =
            typeof meta.estimatedCostUsd === 'number' ? `$${meta.estimatedCostUsd.toFixed(2)} est` : null;
          const actual =
            typeof meta.actualCostUsd === 'number' ? `$${meta.actualCostUsd.toFixed(2)} actual` : null;
          const gpu = typeof meta.gpuType === 'string' ? meta.gpuType : null;
          const output =
            typeof meta.outputLocation === 'string' ? meta.outputLocation : null;
          return (
            <article
              key={row.id}
              className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5"
            >
              <h2 className="font-display text-xl font-semibold">
                {row.renderMode ?? row.resolution ?? 'Render job'}
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {row.rationale ?? row.error ?? 'Queued production render'}
              </p>
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-sun-300">
                {stage} · {provider} · p{row.priority}
                {typeof row.progress === 'number' ? ` · ${Math.round(row.progress * 100)}%` : ''}
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {[estimated, actual, gpu].filter(Boolean).join(' · ') || 'Cost/GPU pending'}
              </p>
              {output ? (
                <p className="mt-1 truncate text-xs text-[var(--muted)]">Output: {output}</p>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

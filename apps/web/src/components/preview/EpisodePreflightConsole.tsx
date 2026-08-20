'use client';

import Link from 'next/link';
import type { buildRealInputConsoleModel } from '@/lib/tivvlejoy-real-input-convergence/console-model';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-[var(--color-background)]/60 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

export function EpisodePreflightConsole({
  model,
}: {
  model: ReturnType<typeof buildRealInputConsoleModel>;
}) {
  return (
    <section className="space-y-4">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">First episode</p>
        <h1 className="font-display text-2xl font-semibold">{model.episodeId} preflight</h1>
        <p className="text-sm font-bold">{model.banner}</p>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          {model.title}. Synthetic fixtures cannot satisfy real preflight. Lock state: {model.lockState}.
        </p>
        <p className="text-sm">
          <Link href="/production-control" className="font-bold underline">
            Production control
          </Link>
          {' · '}
          <Link href="/rig-arrival" className="font-bold underline">
            Rig arrival
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Listed objects" value={model.listedObjects} />
        <Stat label="Real downloads" value={model.downloads} />
        <Stat label="Hashes verified" value={model.hashesVerified} />
        <Stat label="Static inspections" value={model.inspections} />
        <Stat label="Logical children" value={model.children} />
        <Stat label="Review ready" value={model.reviewReady} />
        <Stat label="Human approvals" value={model.humanApprovals} />
        <Stat label="Pip rig" value={model.pipRig} />
        <Stat label="Goat rig" value={model.goatRig} />
        <Stat label="Real-ready shots" value={model.realReadyShots} />
        <Stat label="Partial shots" value={model.partialShots} />
        <Stat label="Blocked shots" value={model.blockedShots} />
      </div>

      <div className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Evidence badges</h2>
        <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.12em]">
          {model.badges.map((badge) => (
            <span key={badge.label} className="rounded-full bg-[var(--color-background)] px-3 py-1">
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      <div className="studio-card space-y-2 p-4 sm:p-5 overflow-x-auto">
        <h2 className="font-display text-xl font-semibold">Shot matrix</h2>
        <table className="min-w-[720px] w-full text-left text-xs">
          <thead>
            <tr>
              <th className="py-2">Shot</th>
              <th>Voice</th>
              <th>Scenery</th>
              <th>Rig</th>
              <th>Blocker</th>
            </tr>
          </thead>
          <tbody>
            {model.shots.map((shot) => (
              <tr key={shot.shotId} className="border-t border-[var(--color-border)]">
                <td className="py-2 font-bold">{shot.shotId}</td>
                <td>{shot.columns.voice}</td>
                <td>{shot.columns.scenery}</td>
                <td>{shot.columns.rig}</td>
                <td className="text-[var(--color-text-muted)]">{shot.exactBlocker}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Subsystems</h2>
        {model.subsystems.map((item) => (
          <p key={item.subsystem} className="text-sm">
            <span className="font-bold">{item.subsystem}</span> · {item.state} · {item.evidenceBadge}
          </p>
        ))}
      </div>

      <div className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Critical path</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {model.criticalPath.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>

      <div className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Morning brief</h2>
        <p className="text-sm font-bold">What needs Justin</p>
        <p className="text-sm text-[var(--color-text-muted)]">{model.morningBrief.whatNeedsJustin.join(' ')}</p>
        <p className="text-sm font-bold">What needs Michael / rigger</p>
        <p className="text-sm text-[var(--color-text-muted)]">{model.morningBrief.whatNeedsMichaelOrRigger.join(' ')}</p>
        <p className="text-sm font-bold">Next safe actions</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {model.nextActions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

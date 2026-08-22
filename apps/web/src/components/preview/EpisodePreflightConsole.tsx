'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { buildRealInputConsoleModel } from '@/lib/tivvlejoy-real-input-convergence/console-model';
import {
  fallbackFirstEpisodeVoiceHandoffModel,
  isFirstEpisodeVoiceHandoffModel,
  type FirstEpisodeVoiceHandoffModel,
} from '@/lib/tivvlejoy-real-production-unblock/console-model';

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
  const [voiceHandoff, setVoiceHandoff] = useState<FirstEpisodeVoiceHandoffModel>(() =>
    fallbackFirstEpisodeVoiceHandoffModel(),
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/voice-production/ep012/control-handoff', {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('EP012_CONTROL_HANDOFF_UNAVAILABLE');
        return response.json() as Promise<unknown>;
      })
      .then((candidate) => {
        if (isFirstEpisodeVoiceHandoffModel(candidate)) setVoiceHandoff(candidate);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const voiceComplete = voiceHandoff.evidenceClass === 'REAL_LEDGER' && voiceHandoff.status === 'HANDOFF_COMPLETE';

  const shots = useMemo(
    () =>
      voiceComplete
        ? model.shots.map((shot) => ({
            ...shot,
            columns: { ...shot.columns, voice: 'REAL_READY' as const },
          }))
        : model.shots,
    [model.shots, voiceComplete],
  );

  const subsystems = useMemo(
    () =>
      voiceComplete
        ? model.subsystems.map((item) => {
            if (item.subsystem === 'VOICE') {
              return {
                ...item,
                state: 'REAL_READY' as const,
                evidenceBadge: 'REAL' as const,
                blocker: '11/11 verified EP012 voice segments are bound to 7/7 dialogue receipts with exact timing.',
              };
            }
            if (item.subsystem === 'ANIMATION') {
              return {
                ...item,
                blocker: 'Verified real voice timing is available; animation remains blocked on admitted Pip and Goat production rigs.',
              };
            }
            if (item.subsystem === 'CAPTIONS') {
              return {
                ...item,
                blocker: 'Verified real voice timing is available; caption output still requires real episode assembly and review.',
              };
            }
            return item;
          })
        : model.subsystems,
    [model.subsystems, voiceComplete],
  );

  const criticalPath = useMemo(
    () =>
      voiceComplete
        ? model.criticalPath.filter((item) => !item.startsWith('Real ElevenLabs-or-recorded receipts'))
        : model.criticalPath,
    [model.criticalPath, voiceComplete],
  );

  const nextActions = useMemo(
    () =>
      voiceComplete
        ? model.nextActions.filter((item) => !/voice|synthesi[sz]e/i.test(item))
        : model.nextActions,
    [model.nextActions, voiceComplete],
  );

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

      <section className="studio-card space-y-3 p-4 sm:p-5" data-testid="ep012-preflight-voice-handoff">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">EP012 real voice evidence</h2>
          <span className="rounded-full bg-[var(--color-background)] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em]">
            {voiceComplete ? 'REAL LEDGER' : 'BLOCKED'}
          </span>
        </div>
        <p className="text-sm font-bold">{voiceHandoff.status}</p>
        <p className="text-sm leading-6">{voiceHandoff.statusLabel}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Verified segments" value={`${voiceHandoff.segmentCount}/11`} />
          <Stat label="Dialogue receipts" value={`${voiceHandoff.dialogueReceiptCount}/7`} />
          <Stat label="Exact timing" value={`${voiceHandoff.exactTimingSegmentCount}/11`} />
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          This panel consumes the same sanitized, read-only durable-ledger handoff as Production Control. It makes no provider request,
          reads no storage object during handoff, and does not enable Production.
        </p>
      </section>

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
            {shots.map((shot) => (
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
        {subsystems.map((item) => (
          <p key={item.subsystem} className="text-sm">
            <span className="font-bold">{item.subsystem}</span> · {item.state} · {item.evidenceBadge}
          </p>
        ))}
      </div>

      <div className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Critical path</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {criticalPath.map((item) => (
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
          {nextActions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

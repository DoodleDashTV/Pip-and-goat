'use client';

import { useMemo, useState } from 'react';
import { PreviewPageIntro } from './PreviewEmptyState';
import { assembleEp012 } from '@/lib/tivvlejoy-shot-assembly-manifest';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 break-all text-sm font-semibold">{value}</p>
    </div>
  );
}

export function ShotAssemblyPlanner() {
  const report = useMemo(() => assembleEp012(), []);
  const [shotId, setShotId] = useState(report.manifests[1]?.shotId ?? report.manifests[0]?.shotId ?? 'SH002');
  const manifest = report.manifests.find((item) => item.shotId === shotId) ?? report.manifests[0]!;
  const location = report.instances.find((item) => item.shotIds.includes(manifest.shotId));
  const pip = manifest.characters.slots.find((slot) => slot.characterId === 'PIP');
  const goat = manifest.characters.slots.find((slot) => slot.characterId === 'GOAT');
  const resolvedSlots = manifest.environmentAssets.slots.filter((slot) => String(slot.dependencyStatus).startsWith('RESOLVED'));
  const unresolvedSlots = manifest.environmentAssets.slots.filter((slot) => !String(slot.dependencyStatus).startsWith('RESOLVED'));

  return (
    <div className="space-y-4 overflow-x-hidden">
      <PreviewPageIntro
        kicker="Shot Assembly Planner"
        title="TivvleJoy shot assembly planner"
        instruction="Planning only. No Blender execution. No Botaniq processing. No paid GPU."
      />

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
          PLANNING ONLY / NO BLENDER EXECUTION / NO BOTANIQ PROCESSING / NO PAID GPU
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Synthetic EP012 assembly manifests. Production rigs stay unresolved. Commercial vegetation stays
          unresolved. Native Blender is the safe lighting path.
        </p>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <Field label="Episode" value={`${report.episodeId} · ${report.title}`} />
        <Field label="Shot count" value={String(report.metrics.shotCount)} />
        <Field label="Unique location instances" value={String(report.metrics.uniqueLocationInstances)} />
        <Field label="Base environment loads" value={String(report.metrics.baseEnvironmentLoads)} />
        <Field label="Reused environment instances" value={String(report.metrics.reusedEnvironmentInstances)} />
        <Field label="Ready planning shots" value={String(report.metrics.readyPlanningShotCount)} />
        <Field label="Ready real-assembly shots" value={String(report.metrics.readyRealAssemblyShotCount)} />
        <Field label="Blocked shots" value={String(report.metrics.blockedShotCount)} />
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Shots</h2>
        <div className="flex flex-wrap gap-2">
          {report.manifests.map((item) => (
            <button
              key={item.shotId}
              type="button"
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                item.shotId === manifest.shotId
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'border border-[var(--color-border)]'
              }`}
              onClick={() => setShotId(item.shotId)}
            >
              {item.shotId}
            </button>
          ))}
        </div>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <Field label="Shot" value={manifest.shotId} />
        <Field label="Assembly status" value={manifest.assemblyStatus} />
        <Field label="Real assembly readiness" value={manifest.realAssemblyStatus} />
        <Field label="Location instance" value={location?.locationInstanceId ?? 'UNRESOLVED'} />
        <Field label="Camera" value={`${manifest.camera.cameraTemplateId} · ${manifest.camera.focalTarget}`} />
        <Field label="Lighting" value={`${manifest.lighting.lightingPresetId} · ${manifest.lighting.pluginDependency}`} />
        <Field label="Pip slot" value={`${pip?.visibility ? 'visible' : 'hidden'} · ${pip?.rigVersion ?? 'UNRESOLVED'}`} />
        <Field label="Goat slot" value={`${goat?.visibility ? 'visible' : 'hidden'} · ${goat?.rigVersion ?? 'UNRESOLVED'}`} />
        <Field
          label="Story props"
          value={manifest.storyProps.slots.map((slot) => slot.propId).join(', ') || 'none'}
        />
        <Field
          label="Assembly dependency SHA"
          value={manifest.assemblyDependencySha256}
        />
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Environment slots</h2>
        <ul className="space-y-2 text-sm">
          {manifest.environmentAssets.slots.map((slot) => (
            <li key={slot.slotId}>
              <span className="font-bold">{slot.slotId}</span>
              <span className="text-[var(--color-text-muted)]">
                {' '}
                · {slot.semanticRole} · {slot.dependencyStatus} · {slot.providerPreference}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <Field
          label="Resolved dependencies"
          value={resolvedSlots.map((slot) => slot.slotId).join(', ') || 'none'}
        />
        <Field
          label="Unresolved dependencies"
          value={[...manifest.unresolvedDependencies, ...unresolvedSlots.map((slot) => slot.slotId)].join(', ')}
        />
        <Field label="Hard blockers" value={manifest.hardBlockers.join(', ')} />
        <Field
          label="Change-impact result"
          value={`unchanged ${report.impact.unchangedShots.length} · preview ${report.impact.previewRerenderShots.length} · stale ${report.impact.visualApprovalStaleShots.length} · ${report.impact.reasonsByShot[manifest.shotId]?.join(', ') ?? 'unchanged'}`}
        />
      </section>
    </div>
  );
}

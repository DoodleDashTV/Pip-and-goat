'use client';

import Link from 'next/link';
import type { AnimationConsoleModel } from '@/lib/tivvlejoy-character-animation/console-model';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-[var(--color-background)]/60 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

export function AnimationControlConsole({ model }: { model: AnimationConsoleModel }) {
  return (
    <section className="space-y-4">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Character animation</p>
        <h1 className="font-display text-2xl font-semibold">Animation control</h1>
        <p className="text-sm font-bold">{model.banner}</p>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          The software layer can plan acting, dialogue timing, visemes, gaze, blinks, locomotion, and QC.
          Real Pip and Goat production rigs have not been admitted. Nothing has been animated in Blender.
        </p>
        <p className="text-sm font-bold">Studio status: Waiting for Pip and Goat production rigs</p>
        <p className="text-sm">Software layer: Character animation pipeline operational</p>
        <p className="text-sm">
          <Link href="/production-control" className="font-bold underline">
            Production control
          </Link>
          {' · '}
          <Link href="/shot-assembly" className="font-bold underline">
            Shot Assembly
          </Link>
          {' · '}
          <Link href="/character-rigging" className="font-bold underline">
            Character Rigging
          </Link>
        </p>
      </div>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Rig admission</h2>
        <p className="text-sm font-bold">Pip: {model.pip.statusLabel}</p>
        <p className="text-sm">Required controls: {model.pip.requiredControls.join(', ')}</p>
        <p className="text-sm text-[var(--color-text-muted)]">Optional / desirable: {model.pip.optionalControls.join(', ')}</p>
        <p className="text-sm font-bold">Goat: {model.goat.statusLabel}</p>
        <p className="text-sm">Required controls: {model.goat.requiredControls.join(', ')}</p>
        <p className="text-sm text-[var(--color-text-muted)]">Optional / desirable: {model.goat.optionalControls.join(', ')}</p>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Season animation plan</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Episodes waiting for rig" value={model.episodesWaitingForRig} />
          <Stat label="Shots waiting for voice timing" value={model.shotsWaitingForVoiceTiming} />
          <Stat label="Shots animation-plan ready" value={model.shotsAnimationPlanReady} />
          <Stat label="Locomotion plans" value={model.locomotionPlans} />
          <Stat label="Prop interactions" value={model.propInteractions} />
          <Stat label="Continuity warnings" value={model.continuityWarnings} />
          <Stat label="Animation QC blockers" value={model.animationQcBlockers} />
          <Stat label="Batch plan" value={model.batchCount} />
          <Stat label="Stale animation deps" value={model.staleAnimationDependencies} />
        </div>
        <p className="text-sm">{model.dialogueTimingConfidence}</p>
        <p className="text-sm">{model.visemeConfidence}</p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Next safe actions</h2>
        {model.nextSafeActions.map((item) => (
          <p key={item} className="text-sm">
            {item}
          </p>
        ))}
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Rig arrival checklist</h2>
        {model.arrival.map((workflow) => (
          <div key={workflow.characterId} className="space-y-1">
            <p className="text-sm font-bold">{workflow.characterId === 'PIP' ? 'Pip' : 'Goat'} dry-run</p>
            {workflow.rows.map((row) => (
              <p key={row.step} className="text-sm text-[var(--color-text-muted)]">
                {row.humanLabel} — not complete
              </p>
            ))}
          </div>
        ))}
      </section>
    </section>
  );
}

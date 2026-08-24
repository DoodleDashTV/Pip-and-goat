'use client';

import Link from 'next/link';
import { GoatSourceIntake } from '@/components/preview/GoatSourceIntake';
import type { buildGoatSourceIntakeConsoleModel } from '@/lib/tivvlejoy-character-source-intake/console-model';

type Model = ReturnType<typeof buildGoatSourceIntakeConsoleModel>;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-[var(--color-background)]/60 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

export function CharacterRiggingConsole({ model }: { model: Model }) {
  return (
    <section className="space-y-4">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
          Character department
        </p>
        <h1 className="font-display text-2xl font-semibold">{model.title}</h1>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">{model.subtitle}</p>
        <p className="text-sm font-bold">
          Status: {model.status} · {model.verdict}
        </p>
        <p className="text-sm">Real asset: {model.realAssetStatus}</p>
        <p className="text-sm">Next input: {model.intake.nextUserAction}</p>
        <p className="text-sm">
          <Link href="/animation-control" className="font-bold underline">
            Animation control
          </Link>
          {' · '}
          <Link href="/rig-arrival" className="font-bold underline">
            Rig arrival
          </Link>
        </p>
      </div>

      <GoatSourceIntake
        initial={{
          state: model.intake.state,
          nextUserAction: model.intake.nextUserAction,
          checklist: model.intake.checklist,
          authorization: model.intake.authorization,
        }}
      />

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Goat CHAR_GOAT_001</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Production ready" value={model.goatProductionReady ? 'Yes' : 'No'} />
          <Stat label="Stages" value={model.stageCount} />
          <Stat label="Blocked stages" value={model.blockedStageCount} />
        </div>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Reports</h2>
        {Object.entries(model.reports).map(([name, status]) => (
          <p key={name} className="text-sm">
            {name}: {status}
          </p>
        ))}
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Pip later</h2>
        <p className="text-sm">{model.futurePip.reason}</p>
      </section>
    </section>
  );
}

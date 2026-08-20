'use client';

import Link from 'next/link';
import type { NightshiftConsoleModel } from '@/lib/tivvlejoy-nightshift-production/console-model';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-[var(--color-background)]/60 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

export function EditorialControlConsole({ model }: { model: NightshiftConsoleModel }) {
  return (
    <section className="space-y-4">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">TivvleJoy editorial</p>
        <h1 className="font-display text-2xl font-semibold">Editorial control</h1>
        <p className="text-sm font-bold">{model.banner}</p>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          Timeline, dialogue, SFX, music, ambience, and caption lanes are planning metadata. This page does not claim a
          final mix or a finished episode.
        </p>
        <nav aria-label="Editorial workspace" className="text-sm">
          <Link href="/director-control" className="inline-flex min-h-11 items-center font-bold underline">
            Director control
          </Link>
          {' · '}
          <Link href="/dailies" className="inline-flex min-h-11 items-center font-bold underline">
            Dailies
          </Link>
        </nav>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Shots" value={model.editorial.shots} />
        <Stat label="Total frames" value={model.editorial.totalFrames} />
        <Stat label="QC warnings" value={model.editorial.qcWarnings} />
        <Stat label="SFX events" value={model.audio.sfx} />
        <Stat label="Music cues" value={model.audio.music} />
        <Stat label="Caption cues" value={model.audio.captions} />
      </div>
    </section>
  );
}

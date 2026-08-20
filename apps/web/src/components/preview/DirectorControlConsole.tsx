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

export function DirectorControlConsole({ model }: { model: NightshiftConsoleModel }) {
  return (
    <section className="space-y-4">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">TivvleJoy directing</p>
        <h1 className="font-display text-2xl font-semibold">Director control</h1>
        <p className="text-sm font-bold">{model.banner}</p>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          Episode intent, beats, cameras, staging, lighting, VFX, and review notes are planned here. Nothing is a final
          render and no synthetic fixture is a human-approved shot.
        </p>
        <p className="text-sm">
          <Link href="/production-control" className="font-bold underline">
            Production control
          </Link>
          {' · '}
          <Link href="/editorial-control" className="font-bold underline">
            Editorial
          </Link>
          {' · '}
          <Link href="/dailies" className="font-bold underline">
            Dailies
          </Link>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Intent-ready episodes" value={model.directing.ready} />
        <Stat label="Waiting human" value={model.directing.waitingHuman} />
        <Stat label="Open notes" value={model.review.open} />
        <Stat label="Approved finals" value={model.review.approved} />
      </div>
      {model.episodes.map((episode) => (
        <article key={episode.episodeId} className="studio-card space-y-1 p-4 sm:p-5">
          <h2 className="font-display text-xl font-semibold">{episode.episodeId}</h2>
          <p className="text-sm font-bold">Episode intent</p>
          <p className="text-sm">{episode.intent}</p>
          <p className="text-sm">Story beats: {episode.beats}</p>
          <p className="text-sm">Shot list: {episode.shots}</p>
          <p className="text-sm">Edit duration: {episode.timelineFrames} frames</p>
          <p className="break-all text-xs text-[var(--color-text-muted)]">Package {episode.packageSha256}</p>
        </article>
      ))}
      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Next safe actions</h2>
        {model.nextSafeActions.map((item) => (
          <p key={item} className="text-sm">
            {item}
          </p>
        ))}
      </section>
    </section>
  );
}

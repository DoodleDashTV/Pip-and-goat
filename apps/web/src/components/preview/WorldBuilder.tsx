'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PreviewPageIntro } from './PreviewEmptyState';
import { evaluateSceneryLongevity } from '@/lib/tivvlejoy-scenery-longevity';
import { syntheticRegistry } from '@/lib/tivvlejoy-approved-asset-registry';
import {
  ARCHETYPE_IDS,
  ENVIRONMENT_RECIPES,
  SEASONS,
  TIMES_OF_DAY,
  WEATHERS,
  assetGapDecision,
  buildEnvironment,
  sceneryCoverageReport,
  type ArchetypeId,
  type Season,
  type TimeOfDay,
  type Weather,
} from '@/lib/tivvlejoy-world-builder';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 break-all text-sm font-semibold">{value}</p>
    </div>
  );
}

export function WorldBuilder() {
  const coverage = useMemo(() => sceneryCoverageReport(), []);
  const [seasonTarget, setSeasonTarget] = useState(60);
  const longevity = useMemo(
    () =>
      evaluateSceneryLongevity({
        requestedEpisodeCount: Math.max(1, seasonTarget),
        approvedAssetRegistry: syntheticRegistry(),
        evidenceClass: 'SYNTHETIC_PREVIEW',
      }),
    [seasonTarget],
  );
  const [archetypeId, setArchetypeId] = useState<ArchetypeId>('BAKERY_EXTERIOR');
  const [season, setSeason] = useState<Season>('SUMMER');
  const [weather, setWeather] = useState<Weather>('CLEAR');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('MORNING_WARM');
  const [storyPurpose, setStoryPurpose] = useState('open on the bakery');
  const env = useMemo(
    () =>
      buildEnvironment({
        locationId: 'bakery',
        archetypeId,
        season,
        weather,
        timeOfDay,
        storyPurpose,
        qualityTarget: 'HERO',
        seed: 4170179,
      }),
    [archetypeId, season, weather, timeOfDay, storyPurpose],
  );
  const gap = assetGapDecision(env, {
    locationId: 'bakery',
    archetypeId,
    season,
    weather,
    timeOfDay,
    storyPurpose,
    qualityTarget: 'HERO',
    seed: 4170179,
  });

  return (
    <div className="space-y-4 overflow-x-hidden">
      <PreviewPageIntro
        kicker="World Builder"
        title="TivvleJoy world builder"
        instruction="Planning only. No Blender execution. No commercial source read. No paid GPU."
      />

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
          PLANNING ONLY / NO BLENDER EXECUTION / BOTANIQ NOT ACTIVATED / PURCHASE DEFAULT = NO
        </p>
        <p className="text-2xl font-bold">SCENERY PURCHASE REQUIRED: {gap.purchaseRequired}</p>
        <p className="text-sm">
          <Link href="/world-builder/assets" className="font-bold underline">
            Approved Asset Registry diagnostics
          </Link>
          {' · '}
          <Link href="/world-builder/longevity" className="font-bold underline">
            Scenery longevity
          </Link>
        </p>
        {gap.missingSemanticRole ? <p className="text-sm">Missing semantic role: {gap.missingSemanticRole}</p> : null}
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <p className="sm:col-span-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
          SCENERY LONGEVITY · SYNTHETIC / PLANNING ANALYSIS · NOT LIVE APPROVED-ASSET COVERAGE
        </p>
        <Field label="Coverage strength" value={longevity.coverageStrength} />
        <Field label="Repetition risk" value={longevity.repetitionRisk.overallRisk} />
        <Field label="Confidence" value={longevity.coverageConfidence} />
        <label className="text-sm">
          Target episode count
          <input
            className="mt-1 w-full rounded-xl border px-2 py-2"
            type="number"
            min={1}
            value={seasonTarget}
            onChange={(event) => setSeasonTarget(Number(event.target.value) || 1)}
          />
        </label>
        <Field label="Approved logical assets" value={String(longevity.approvedLogicalAssetCount)} />
        <Field label="Hero environment diversity" value={String(longevity.heroEnvironmentCount)} />
        <Field label="Interior diversity" value={String(longevity.approvedInteriorShellCount)} />
        <Field label="Background diversity" value={String(longevity.backgroundFamilyCount)} />
        <Field label="High-pressure scenery roles" value={longevity.semanticRoleCoverage.filter((item) => item.pressure === 'BUSY' || item.pressure === 'OVERUSED').map((item) => item.semanticRole).join(', ') || 'none'} />
        <Field label="Specialty gaps" value={longevity.specialtyGaps.map((gap) => gap.semanticRole).join(', ') || 'none in this plan'} />
        <Field label="Purchase needed?" value={longevity.purchaseDecision} />
        <Field label="Library category scores" value={`${coverage.coveragePercent}% planning only`} />
        <Field label="Environment Recipes" value={String(ENVIRONMENT_RECIPES.length)} />
        <Field label="Performance" value={env.budget.status} />
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">WHAT WE ALREADY HAVE</h2>
        <p className="text-sm">{coverage.alreadyHave.join(' · ')}</p>
        <h2 className="font-display text-xl font-semibold">WHAT CAN BE BUILT NATIVELY</h2>
        <p className="text-sm">{coverage.canBuildNatively.length} archetypes</p>
        <h2 className="font-display text-xl font-semibold">WHAT IS OPTIONAL</h2>
        <p className="text-sm">{coverage.optional.join(' · ')}</p>
        <h2 className="font-display text-xl font-semibold">WHAT IS ACTUALLY MISSING</h2>
        <p className="text-sm">{coverage.actuallyMissing.join(', ') || 'no generic purchase list'}</p>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <label className="text-sm">
          Location archetype
          <select className="mt-1 w-full rounded-xl border px-2 py-2" value={archetypeId} onChange={(event) => setArchetypeId(event.target.value as ArchetypeId)}>
            {ARCHETYPE_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Season
          <select className="mt-1 w-full rounded-xl border px-2 py-2" value={season} onChange={(event) => setSeason(event.target.value as Season)}>
            {SEASONS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Weather
          <select className="mt-1 w-full rounded-xl border px-2 py-2" value={weather} onChange={(event) => setWeather(event.target.value as Weather)}>
            {WEATHERS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Time
          <select className="mt-1 w-full rounded-xl border px-2 py-2" value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value as TimeOfDay)}>
            {TIMES_OF_DAY.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Story purpose
          <input className="mt-1 w-full rounded-xl border px-2 py-2" value={storyPurpose} onChange={(event) => setStoryPurpose(event.target.value)} />
        </label>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <Field label="Terrain plan" value={env.terrain.terrainType} />
        <Field label="Architecture plan" value={env.blueprint.architectureProfile} />
        <Field label="Vegetation plan" value={`${env.vegetation.provider} · copies ${env.vegetation.obviousIdenticalCopies}`} />
        <Field label="Lighting plan" value={env.lighting.presetId} />
        <Field label="Dressing plan" value={env.story.items.join(', ') || 'camera-aware defaults'} />
        <Field label="Asset requirements" value={env.blueprint.sourceRequirements.join(', ')} />
        <Field label="Buildability state" value={env.buildability} />
        <Field label="Coverage" value={`${coverage.coveragePercent}% library`} />
        <Field label="Dependency hash" value={env.environmentDependencySha256} />
        <Field label="Gap decision" value={gap.decision} />
      </section>
    </div>
  );
}

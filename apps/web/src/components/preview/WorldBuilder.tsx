'use client';

import { useMemo, useState } from 'react';
import { PreviewPageIntro } from './PreviewEmptyState';
import {
  ARCHETYPE_IDS,
  ENVIRONMENT_RECIPES,
  SEASONS,
  TIMES_OF_DAY,
  WEATHERS,
  assetGapDecision,
  buildEnvironment,
  sceneryCoverageReport,
  scalePlan60,
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
  const scale = useMemo(() => scalePlan60(), []);
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
        {gap.missingSemanticRole ? <p className="text-sm">Missing semantic role: {gap.missingSemanticRole}</p> : null}
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <Field label="Library Coverage" value={`${coverage.coveragePercent}%`} />
        <Field label="Locations" value={`${coverage.estimatedLocationVariantCount} synthetic variants from 7 bases`} />
        <Field label="Biomes" value="village · forest · river · meadow · snow · coast · cave" />
        <Field label="Architecture" value={`${coverage.scores.architecture}`} />
        <Field label="Vegetation" value={`${coverage.scores.vegetation} · native Blender`} />
        <Field label="Interiors" value={`${coverage.scores.interiors} · modular placeholders`} />
        <Field label="Terrain" value={`${coverage.scores.terrain}`} />
        <Field label="Water" value={`${coverage.scores.water}`} />
        <Field label="Weather" value={`${coverage.scores.weather}`} />
        <Field label="Seasons" value={`${coverage.scores.seasonal_variants}`} />
        <Field label="Lighting" value={`${coverage.scores.lighting} · native`} />
        <Field label="Environment Recipes" value={String(ENVIRONMENT_RECIPES.length)} />
        <Field label="Reuse" value={`${scale.estimatedReusePercent}% estimated`} />
        <Field label="Performance" value={env.budget.status} />
        <Field label="Missing Assets" value={coverage.actuallyMissing.join(', ') || 'none required'} />
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

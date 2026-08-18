'use client';

import { useMemo, useState } from 'react';
import { SCENERY_COPY } from '@/lib/scenery/copy';
import { acceptanceSceneBrief } from '@/lib/scenery/fixtures';
import { planSceneryScene } from '@/lib/scenery/planner';
import { SYNTHETIC_SCENERY_CATALOG } from '@/lib/scenery/fixtures';
import type { PublicScenerySnapshot } from '@/lib/scenery/public';
import { RECIPE_IDS, DEFAULT_SCENERY_SEED } from '@/lib/scenery/types';
import { PreviewPageIntro } from './PreviewEmptyState';
import { SceneryAssetIntake } from './SceneryAssetIntake';

type PlanResponse = {
  plan?: {
    seed: number;
    recipeId: string;
    placements: Array<{ assetId: string; role: string; layer: string; position: { x: number; y: number; z: number } }>;
    textureTier: string;
    resourceEstimate: { triangleCount: number; estimatedMemoryMb: number; complexity: string };
    missingPrerequisites: string[];
    rendered: boolean;
    camera: { aspectRatio: string };
    lighting: { key: string; fill: string; rim: string };
    atmosphere: string;
    provenance: { fixtureOnly: boolean; purchasedBytesInspected: boolean };
  };
  validation?: {
    ok: boolean;
    findings: Array<{ code: string; severity: string; message: string }>;
    geometricLimitation: string;
  };
  error?: string;
  rendered: boolean;
};

export function SceneryStudio({
  publicPreview,
  snapshot,
}: {
  publicPreview: boolean;
  snapshot: PublicScenerySnapshot;
}) {
  const [recipe, setRecipe] = useState<(typeof RECIPE_IDS)[number]>('forest_village_day');
  const [seed, setSeed] = useState(String(DEFAULT_SCENERY_SEED));
  const [storyPurpose, setStoryPurpose] = useState('Pip and Goat follow a path toward a cabin');
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const localFallback = useMemo(() => {
    if (!result?.plan) return null;
    return result;
  }, [result]);

  async function generatePlan() {
    setBusy(true);
    const brief = acceptanceSceneBrief({
      recipe,
      seed: Number(seed) || DEFAULT_SCENERY_SEED,
      storyPurpose,
    });
    try {
      const res = await fetch('/api/scenery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'plan', brief }),
      });
      const data = (await res.json()) as PlanResponse;
      if (!res.ok) {
        const plan = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, brief);
        setResult({
          plan,
          error: data.error,
          rendered: false,
          validation: {
            ok: false,
            findings: [{ code: 'REQUEST', severity: 'error', message: data.error ?? 'Plan request refused.' }],
            geometricLimitation: 'Exact mesh checks require Blender. Real Blender execution was not run.',
          },
        });
        return;
      }
      setResult({ ...data, rendered: false });
    } catch {
      const plan = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, brief);
      setResult({
        plan,
        rendered: false,
        validation: {
          ok: true,
          findings: [],
          geometricLimitation: 'Client fallback plan. Nothing was rendered.',
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 overflow-x-hidden">
      <PreviewPageIntro
        kicker={SCENERY_COPY.kicker}
        title={SCENERY_COPY.title}
        instruction={SCENERY_COPY.instruction}
      />
      <section className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
          {SCENERY_COPY.previewOnly} / {SCENERY_COPY.noRender}
        </p>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          {publicPreview
            ? 'This Preview workspace can plan scenery only. It does not render frames or open purchased files.'
            : 'Scenery planning stays preview-only. Purchased files are not assembled here.'}
        </p>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {SCENERY_COPY.softwareFoundation}
          </p>
          <p className="mt-1 text-lg font-bold">
            {snapshot.intake.softwareFoundation.available ? 'available' : 'unavailable'}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            tested: {snapshot.intake.softwareFoundation.tested ? 'yes' : 'no'} · preview planning:{' '}
            {snapshot.intake.softwareFoundation.previewPlanningEnabled ? 'enabled' : 'disabled'}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {SCENERY_COPY.realAssetReadiness}
          </p>
          <p className="mt-1 text-lg font-bold">
            {snapshot.intake.realAssetReadiness.realSceneryProductionReady ? 'ready' : 'not ready'}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            {snapshot.intake.realAssetReadiness.storageConfiguration} · uploaded{' '}
            {snapshot.intake.realAssetReadiness.uploadedFiles}/
            {snapshot.intake.realAssetReadiness.expectedFiles}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {SCENERY_COPY.verifiedFiles}
          </p>
          <p className="mt-1 text-lg font-bold">{snapshot.intake.realAssetReadiness.verifiedFiles}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {SCENERY_COPY.inspectionReadyFiles}
          </p>
          <p className="mt-1 text-lg font-bold">{snapshot.intake.realAssetReadiness.inspectionReadyFiles}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {SCENERY_COPY.inspectedFiles}
          </p>
          <p className="mt-1 text-lg font-bold">{snapshot.intake.realAssetReadiness.inspectedFiles}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {SCENERY_COPY.quarantinedAssets}
          </p>
          <p className="mt-1 text-lg font-bold">{snapshot.intake.realAssetReadiness.quarantinedFiles}</p>
        </div>
      </section>

      <SceneryAssetIntake snapshot={snapshot} />

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Source collections</h2>
        <ul className="space-y-2">
          {snapshot.sources.map((source) => (
            <li
              key={source.sourceId}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-3"
            >
              <p className="font-bold text-[var(--color-text)]">{source.collectionName}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                {source.sourceId} · {source.ingestionStatus} · inspected: {source.bytesInspected ? 'yes' : 'no'}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {SCENERY_COPY.registeredAssets}
          </p>
          <p className="mt-1 text-lg font-bold">{snapshot.assets.registered}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {SCENERY_COPY.normalizedAssets}
          </p>
          <p className="mt-1 text-lg font-bold">{snapshot.assets.normalizedPurchased}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {SCENERY_COPY.quarantinedAssets}
          </p>
          <p className="mt-1 text-lg font-bold">{snapshot.assets.quarantined}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {SCENERY_COPY.approvedAssets}
          </p>
          <p className="mt-1 text-lg font-bold">{snapshot.assets.approvedPurchased}</p>
        </div>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Available recipes</h2>
        <ul className="space-y-2">
          {snapshot.recipes.map((item) => (
            <li key={item.recipeId} className="text-sm leading-6 text-[var(--color-text)]">
              <span className="font-bold">{item.displayName}</span>
              <span className="text-[var(--color-text-muted)]"> · {item.recipeId} · {item.biome}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="studio-card space-y-4 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Scene brief</h2>
        <label className="block text-sm font-bold">
          Recipe
          <select
            className="field-input mt-1"
            value={recipe}
            onChange={(event) => setRecipe(event.target.value as (typeof RECIPE_IDS)[number])}
          >
            {RECIPE_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold">
          Story purpose
          <input
            className="field-input mt-1"
            value={storyPurpose}
            onChange={(event) => setStoryPurpose(event.target.value)}
          />
        </label>
        <label className="block text-sm font-bold">
          {SCENERY_COPY.seedLabel}
          <input
            className="field-input mt-1"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <button type="button" className="btn-primary w-full px-4 text-sm sm:w-auto" disabled={busy} onClick={generatePlan}>
          {SCENERY_COPY.generatePlan}
        </button>
      </section>

      {localFallback?.plan ? (
        <section className="studio-card space-y-3 p-4 sm:p-5">
          <h2 className="font-display text-xl font-semibold">Generated scene plan</h2>
          <p className="text-sm font-bold text-[var(--color-success-foreground)]">{SCENERY_COPY.planCreated}</p>
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            Recipe {localFallback.plan.recipeId} · seed {localFallback.plan.seed} · texture {localFallback.plan.textureTier} ·
            camera {localFallback.plan.camera.aspectRatio}
          </p>
          <p className="text-sm leading-6">
            {SCENERY_COPY.estimatedComplexity}: {localFallback.plan.resourceEstimate.complexity} ·{' '}
            {localFallback.plan.resourceEstimate.triangleCount} triangles ·{' '}
            {localFallback.plan.resourceEstimate.estimatedMemoryMb} MB
          </p>
          <ul className="space-y-1 text-sm">
            {localFallback.plan.placements.map((item) => (
              <li key={`${item.role}-${item.assetId}`}>
                {item.role}: {item.assetId} ({item.layer})
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">{SCENERY_COPY.missingPrerequisites}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--color-text-muted)]">
          {(result?.plan?.missingPrerequisites ?? snapshot.missingPrerequisites).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="studio-card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">{SCENERY_COPY.validationResults}</h2>
        {result?.validation ? (
          <ul className="space-y-2 text-sm">
            {result.validation.findings.length === 0 ? (
              <li>Fixture plan checks passed. {result.validation.geometricLimitation}</li>
            ) : (
              result.validation.findings.map((item) => (
                <li key={`${item.code}-${item.message}`}>
                  <span className="font-bold">{item.severity}</span> · {item.code}: {item.message}
                </li>
              ))
            )}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">Generate a plan to see validation.</p>
        )}
      </section>
    </div>
  );
}

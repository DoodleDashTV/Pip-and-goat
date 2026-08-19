'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { defaultLongevityInput, evaluateSceneryLongevity } from '@/lib/tivvlejoy-scenery-longevity';

export function SceneryLongevityPreview() {
  const [target, setTarget] = useState(60);
  const [windowSize, setWindowSize] = useState(10);
  const report = useMemo(
    () =>
      evaluateSceneryLongevity(
        defaultLongevityInput({
          requestedEpisodeCount: Math.max(1, target),
          recentWindowSize: Math.max(1, windowSize),
        }),
      ),
    [target, windowSize],
  );

  return (
    <section className="space-y-5">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">World Builder</p>
        <h1 className="font-display text-2xl font-semibold">SCENERY LONGEVITY</h1>
        <p className="text-sm font-bold">SYNTHETIC / PLANNING ANALYSIS · NOT LIVE APPROVED-ASSET COVERAGE</p>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          48 was a planning placeholder, not a hard production limit. This page evaluates a caller-supplied season
          target. It does not invent a maximum episode count.
        </p>
        <p className="text-sm">
          <Link href="/world-builder" className="font-bold underline">
            Back to World Builder
          </Link>
          {' · '}
          <Link href="/world-builder/assets" className="font-bold underline">
            Approved assets
          </Link>
          {' · '}
          <Link href="/production-control" className="font-bold underline">
            Production control
          </Link>
        </p>
      </div>

      <section className="studio-card grid gap-3 p-4 sm:p-5 sm:grid-cols-2">
        <h2 className="font-display text-xl font-semibold sm:col-span-2">Season Target</h2>
        <label className="text-sm">
          Requested episode count
          <input className="mt-1 w-full rounded-xl border px-2 py-2" type="number" min={1} value={target} onChange={(event) => setTarget(Number(event.target.value) || 1)} />
        </label>
        <label className="text-sm">
          Recent window size
          <input className="mt-1 w-full rounded-xl border px-2 py-2" type="number" min={1} value={windowSize} onChange={(event) => setWindowSize(Number(event.target.value) || 1)} />
        </label>
        <p className="sm:col-span-2 text-sm font-bold">{report.seasonTargetSummary}</p>
        <p className="text-sm">Coverage strength: {report.coverageStrength}</p>
        <p className="text-sm">Repetition risk: {report.repetitionRisk.overallRisk}</p>
        <p className="text-sm">Confidence: {report.coverageConfidence}</p>
        <p className="text-sm">Purchase needed? {report.purchaseDecision}</p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Repetition Risk</h2>
        <p className="text-sm">Location reuse: {report.repetitionRisk.locationReuseRisk}</p>
        <p className="text-sm">Archetype reuse: {report.repetitionRisk.archetypeReuseRisk}</p>
        <p className="text-sm">Hero set reuse: {report.repetitionRisk.heroSetReuseRisk}</p>
        <p className="text-sm">Interior reuse: {report.repetitionRisk.interiorReuseRisk}</p>
        <p className="text-sm">Background reuse: {report.repetitionRisk.backgroundReuseRisk}</p>
        <p className="text-sm">Consecutive similarity: {report.repetitionRisk.consecutiveSimilarityRisk}</p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Location Load</h2>
        {report.locationLoad.map((item) => (
          <p key={item.locationId} className="text-sm">
            {item.locationId}: planned {item.plannedUses}, recent {item.recentUses}, signatures {item.distinctVisualSignatures}, risk {item.repetitionRisk}
          </p>
        ))}
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Archetype Load</h2>
        {report.archetypeLoad.slice(0, 8).map((item) => (
          <p key={item.archetypeId} className="text-sm">
            {item.archetypeId}: uses {item.useCount}, approved {item.compatibleApprovedAssets}, risk {item.repetitionRisk}
          </p>
        ))}
      </section>

      <section className="studio-card grid gap-2 p-4 sm:p-5 sm:grid-cols-2">
        <h2 className="font-display text-xl font-semibold sm:col-span-2">Hero / Interior / Background</h2>
        <p className="text-sm">Hero environments: {report.heroEnvironmentCount} · pressure {report.heroReusePressure}</p>
        <p className="text-sm">Interior shells: {report.approvedInteriorShellCount} · pressure {report.interiorReusePressure}</p>
        <p className="text-sm">Background families: {report.backgroundFamilyCount}</p>
        <p className="text-sm">Mountain / sky / fill: {report.mountainBackgroundCount} / {report.skyFamilyCount} / {report.backgroundFillCount}</p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Semantic Role Pressure</h2>
        {report.semanticRoleCoverage.map((item) => (
          <p key={item.semanticRole} className="text-sm">
            {item.semanticRole}: {item.pressure} · supply {item.supplyCanonicalGroups} · demand {item.demand}
          </p>
        ))}
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Specialty Gaps</h2>
        <p className="text-sm">{report.specialtyGaps.map((gap) => `${gap.semanticRole} (${gap.reason})`).join(' · ') || 'None. Specialty gaps require a planned story role.'}</p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Purchase Decision</h2>
        <p className="text-sm font-bold">{report.purchaseDecision}</p>
        <p className="text-sm">Semantic gap: {report.purchaseSemanticGap ?? 'none'}</p>
        <p className="text-sm">Repetition pressure alone never justifies a purchase.</p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Recent Repetition Window</h2>
        <p className="text-sm">Window {report.repetitionRisk.recentWindowAnalysis.windowSize} · analyzed {report.repetitionRisk.recentWindowAnalysis.analyzedEpisodeCount}</p>
        <p className="text-sm">Distinct locations {report.repetitionRisk.recentWindowAnalysis.distinctLocations} · signatures {report.repetitionRisk.recentWindowAnalysis.distinctSignatures}</p>
        <p className="text-sm">Longest identical run {report.repetitionRisk.recentWindowAnalysis.longestConsecutiveIdenticalSignatures}</p>
      </section>

      <section className="studio-card space-y-2 p-4 sm:p-5">
        <h2 className="font-display text-xl font-semibold">Why This Score</h2>
        {report.repetitionRisk.reasons.map((reason) => (
          <p key={reason} className="text-sm">
            {reason}
          </p>
        ))}
        {report.longevitySignals.map((signal) => (
          <p key={signal} className="text-sm text-[var(--color-text-muted)]">
            {signal}
          </p>
        ))}
      </section>
    </section>
  );
}

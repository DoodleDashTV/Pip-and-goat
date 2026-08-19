'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  makeResolutionRequest,
  resolveApprovedAsset,
  syntheticRegistry,
  type ProductionSemanticRole,
} from '@/lib/tivvlejoy-approved-asset-registry';

const EXAMPLES: Array<{ label: string; role: ProductionSemanticRole; archetypeId: string; biome: string; depth: 'FOREGROUND' | 'MIDGROUND' | 'BACKGROUND'; quality: 'HERO' | 'SUPPORTING' | 'BACKGROUND' }> = [
  { label: 'Sunny bakery / village building', role: 'BUILDING_HERO', archetypeId: 'BAKERY_EXTERIOR', biome: 'village', depth: 'MIDGROUND', quality: 'HERO' },
  { label: 'Cozy bakery interior', role: 'INTERIOR_SHELL', archetypeId: 'BAKERY_INTERIOR', biome: 'village', depth: 'MIDGROUND', quality: 'HERO' },
  { label: 'Forest path', role: 'TREE_HERO', archetypeId: 'FOREST_PATH', biome: 'forest', depth: 'MIDGROUND', quality: 'HERO' },
  { label: 'Mountain overlook background', role: 'MOUNTAIN_BACKGROUND', archetypeId: 'MOUNTAIN_OVERLOOK', biome: 'mountain', depth: 'BACKGROUND', quality: 'BACKGROUND' },
  { label: 'River road', role: 'WATER', archetypeId: 'RIVERBANK', biome: 'river', depth: 'MIDGROUND', quality: 'SUPPORTING' },
  { label: 'Snowy village background', role: 'BACKGROUND_FILL', archetypeId: 'SNOW_VILLAGE', biome: 'village', depth: 'BACKGROUND', quality: 'BACKGROUND' },
];

export function ApprovedAssetRegistryPreview() {
  const registry = useMemo(() => syntheticRegistry(), []);
  const [seed, setSeed] = useState(4170179);
  const examples = useMemo(
    () =>
      EXAMPLES.map((example) => {
        const request = makeResolutionRequest({
          slotId: `EX_${example.role}`,
          semanticRole: example.role,
          archetypeId: example.archetypeId,
          biome: example.biome,
          depth: example.depth,
          qualityTier: example.quality,
          season: 'SUMMER',
          weather: 'CLEAR',
          styleRequirement: 'TIVVLEJOY_STORYBOOK',
          seed,
          registrySnapshotSha256: registry.registrySha256,
        });
        return { example, result: resolveApprovedAsset(registry, request) };
      }),
    [registry, seed],
  );
  const approved = registry.assets.filter((asset) => asset.approvalState === 'APPROVED');
  const selectable = approved.filter((asset) => asset.worldBuilderEligible && asset.canonicalState !== 'DUPLICATE' && asset.canonicalState !== 'ARCHIVAL');

  return (
    <section className="space-y-5">
      <div className="studio-card space-y-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">World Builder</p>
        <h1 className="font-display text-2xl font-semibold">APPROVED ASSET REGISTRY — PREVIEW CONTRACT</h1>
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          Synthetic contract data only. This page does not read live R2 approvals.
        </p>
        <p className="text-sm font-bold">
          NO COMMERCIAL FILES READ · NO BLENDER EXECUTION · NO GPU · NO AUTO-APPROVAL · PREVIEW / SYNTHETIC CONTRACT DATA
        </p>
        <p className="text-sm">
          <Link href="/world-builder" className="font-bold underline">
            Back to World Builder
          </Link>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ['Registry hash', registry.registrySha256.slice(0, 16)],
          ['Approved logical assets', approved.length],
          ['Selectable assets', selectable.length],
          ['Canonical groups', new Set(registry.assets.map((asset) => asset.canonicalGroupId)).size],
          ['Duplicates', registry.assets.filter((asset) => asset.canonicalState === 'DUPLICATE').length],
          ['Archival assets', registry.assets.filter((asset) => asset.canonicalState === 'ARCHIVAL').length],
          ['Blocked assets', registry.assets.filter((asset) => asset.approvalState === 'BLOCKED' || asset.approvalState === 'QUARANTINED').length],
        ].map(([label, value]) => (
          <div key={String(label)} className="studio-card px-3 py-3">
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</dt>
            <dd className="mt-1 break-all font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      <label className="block text-sm font-bold">
        Example seed
        <input
          className="mt-1 w-full rounded-xl border px-2 py-2"
          type="number"
          value={seed}
          onChange={(event) => setSeed(Number(event.target.value) || 0)}
        />
      </label>

      <ul className="space-y-3">
        {examples.map(({ example, result }) => (
          <li key={example.label} className="studio-card space-y-1 p-4">
            <p className="font-bold">{example.label}</p>
            <p className="text-sm">{example.role} · {example.archetypeId} · {result.resolutionState}</p>
            <p className="text-sm">Selected approved asset ID: {result.selectedAssetId ?? 'none'}</p>
            {'rankTuple' in result ? <p className="break-all text-sm">Rank reason: {result.rankTuple.slice(0, 10).join(',')}</p> : null}
            <p className="text-sm">
              Source hash present: {'sourceSha256' in result ? 'yes' : 'no'} · Inspection hash present:{' '}
              {'inspectionSha256' in result ? 'yes' : 'no'} · Approval hash present:{' '}
              {'approvalSha256' in result ? 'yes' : 'no'}
            </p>
            <p className="text-sm">
              Shot Assembly handoff state:{' '}
              {result.selectedAssetId ? 'RESOLVED_APPROVED (planning)' : result.resolutionState}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

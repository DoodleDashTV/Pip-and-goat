import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SEASON_ONE_EPISODE_PRODUCTION_BLUEPRINT_SCHEMA,
  compileSeasonOneEpisodeProductionBlueprint,
} from './tivvlejoy-season-one-episode-production-blueprint';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_SEASON_ONE_EPISODE_PRODUCTION_BLUEPRINT_V1', () => {
  it('compiles deterministically and binds to the EP001 proof archive', () => {
    const first = compileSeasonOneEpisodeProductionBlueprint();
    const second = compileSeasonOneEpisodeProductionBlueprint();
    expect(first.schemaVersion).toBe(SEASON_ONE_EPISODE_PRODUCTION_BLUEPRINT_SCHEMA);
    expect(first.blueprintSha256).toBe(second.blueprintSha256);
    expect(first.blueprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.proofArchiveManifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('defines EP002 through EP060 without instantiating them', () => {
    const blueprint = compileSeasonOneEpisodeProductionBlueprint();
    expect(blueprint.futureEpisodeIds).toHaveLength(59);
    expect(blueprint.futureEpisodeIds[0]).toBe('EP002');
    expect(blueprint.futureEpisodeIds.at(-1)).toBe('EP060');
    expect(blueprint.metrics.seasonEpisodeCount).toBe(60);
    expect(blueprint.metrics.stageCountPerEpisode).toBe(10);
    expect(blueprint.safety.generatedEpisodeRecords).toBe(0);
  });

  it('keeps every inherited stage human-gated and future execution closed', () => {
    const blueprint = compileSeasonOneEpisodeProductionBlueprint();
    expect(blueprint.stages.every((stage) => stage.defaultState === 'NOT_STARTED' && stage.humanGateRequired && !stage.autoApprovalAllowed)).toBe(true);
    expect(blueprint.authority.futureEpisodesInstantiated).toBe(false);
    expect(blueprint.authority.episodeExecutionAllowed).toBe(false);
    expect(blueprint.authority.paidComputeAllowed).toBe(false);
    expect(blueprint.authority.publishingAllowed).toBe(false);
    expect(blueprint.authority.productionWritesAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/season-one/production-blueprint/page.tsx');
    expect(page).toContain('Episode production blueprint');
    expect(page).toContain('compileSeasonOneEpisodeProductionBlueprint()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

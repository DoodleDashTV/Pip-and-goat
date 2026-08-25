import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileEp001ProductionPackage } from './tivvlejoy-ep001-production-package';
import {
  EP001_SCENERY_PULL_SHEET_SCHEMA,
  compileEp001SceneryPullSheet,
} from './tivvlejoy-ep001-scenery-pull-sheet';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_SCENERY_PULL_SHEET_V1', () => {
  it('compiles deterministically and binds to the exact Episode 1 package', () => {
    const episode = compileEp001ProductionPackage();
    const first = compileEp001SceneryPullSheet(episode);
    const second = compileEp001SceneryPullSheet(episode);

    expect(first.schemaVersion).toBe(EP001_SCENERY_PULL_SHEET_SCHEMA);
    expect(first.episodeId).toBe('EP001');
    expect(first.productionPackageSha256).toBe(episode.packageSha256);
    expect(first.pullSheetSha256).toBe(second.pullSheetSha256);
    expect(first.pullSheetSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds three reusable location bases for all ten shots', () => {
    const pullSheet = compileEp001SceneryPullSheet();

    expect(pullSheet.locations.map((location) => location.locationId)).toEqual([
      'bakery',
      'main_street',
      'forest_exit',
    ]);
    expect(pullSheet.shots.map((shot) => shot.shotId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `EP001_SH${String(index + 1).padStart(2, '0')}`),
    );
    expect(pullSheet.metrics).toMatchObject({
      locationCount: 3,
      shotCount: 10,
      uniqueRequiredRoleCount: 11,
      storyPropCount: 2,
      baseLocationLoadCount: 3,
      reusedEnvironmentInstanceCount: 7,
      estimatedBaseReusePercent: 70,
      qualityGateCount: 10,
    });
    expect(pullSheet.locations.reduce((total, location) => total + location.baseLoadCount, 0)).toBe(
      3,
    );
  });

  it('preserves every package role while leaving real source identity unresolved', () => {
    const episode = compileEp001ProductionPackage();
    const pullSheet = compileEp001SceneryPullSheet(episode);

    for (const location of pullSheet.locations) {
      const packageBinding = episode.sceneryBindings.find(
        (binding) => binding.locationId === location.locationId,
      )!;
      expect(location.requiredRoles.map((role) => role.semanticRole)).toEqual(
        packageBinding.requiredRoles,
      );
      expect(location.bindingState).toBe('UNRESOLVED_APPROVED_ASSETS_REQUIRED');
      expect(
        location.requiredRoles.every(
          (role) =>
            role.resolutionState === 'UNRESOLVED_APPROVED_BINDING_REQUIRED' &&
            role.selectedAssetId === null &&
            role.selectedAssetVersion === null &&
            role.sourceSha256 === null &&
            role.approvalReceiptRef === null,
        ),
      ).toBe(true);
    }
  });

  it('makes focal scenery and story-prop continuity explicit for critical shots', () => {
    const shots = new Map(compileEp001SceneryPullSheet().shots.map((shot) => [shot.shotId, shot]));
    const priority = (shotId: string, role: string) =>
      shots.get(shotId)!.roleVisibility.find((candidate) => candidate.semanticRole === role)
        ?.visibilityPriority;

    expect(priority('EP001_SH01', 'BUILDING_HERO')).toBe('STORY_READABLE');
    expect(priority('EP001_SH01', 'SIGNAGE')).toBe('STORY_READABLE');
    expect(priority('EP001_SH06', 'FLOWERS')).toBe('STORY_READABLE');
    expect(priority('EP001_SH07', 'TREE_HERO')).toBe('STORY_READABLE');
    expect(priority('EP001_SH08', 'TREE_HERO')).toBe('STORY_READABLE');
    expect(priority('EP001_SH10', 'PATH')).toBe('STORY_READABLE');

    expect(shots.get('EP001_SH07')!.storyProps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          propId: 'MAP_FRAGMENT',
          state: 'caught on the flexible branch above Goat',
          carrier: 'NONE',
          visibility: 'HERO',
        }),
      ]),
    );
    expect(shots.get('EP001_SH09')!.storyProps.every((prop) => prop.visibility === 'HERO')).toBe(
      true,
    );
    expect(shots.get('EP001_SH10')!.storyProps).toEqual([
      expect.objectContaining({
        propId: 'STORY_MAP',
        state: 'repaired, folded, and carried into the next episode',
        carrier: 'PIP',
      }),
    ]);
  });

  it('keeps every approval and execution gate fail-closed', () => {
    const pullSheet = compileEp001SceneryPullSheet();

    expect(pullSheet.state).toBe('LOGICAL_PULL_SHEET_READY_ASSETS_UNRESOLVED');
    expect(pullSheet.qualityGates.every((gate) => !gate.complete && !gate.autoApproval)).toBe(true);
    expect(pullSheet.shots.every((shot) => !shot.assemblyAllowed)).toBe(true);
    expect(pullSheet.authority).toEqual({
      approvedAssetBindingsIssued: false,
      sceneryVisualApprovalIssued: false,
      shotAssemblyAllowed: false,
      blenderExecutionAllowed: false,
      paidComputeAllowed: false,
      productionWritesAllowed: false,
      autoApprovalAllowed: false,
    });
    expect(pullSheet.safety).toEqual({
      logicalRequirementsOnly: true,
      commercialSourceBytesRead: 0,
      networkCalls: 0,
      storageMutations: 0,
      blenderExecuted: false,
    });
  });

  it('renders a read-only Studio route linked from the Episode 1 review', () => {
    const episodePage = readRepo('apps/web/src/app/episode-one/page.tsx');
    const sceneryPage = readRepo('apps/web/src/app/episode-one/scenery/page.tsx');

    expect(episodePage).toContain("['/episode-one/scenery', 'Scenery pull sheet']");
    expect(episodePage).toContain('Open scenery pull sheet');
    expect(sceneryPage).toContain('compileEp001SceneryPullSheet()');
    expect(sceneryPage).toContain('Build three bases, reuse them across ten shots');
    expect(sceneryPage).toContain('Camera-aware requirements for every shot');
    expect(sceneryPage).toContain('no paid compute');
    expect(sceneryPage).not.toContain("'use client'");
    expect(sceneryPage).not.toContain("'use server'");
    expect(sceneryPage).not.toContain('fetch(');
    expect(sceneryPage).not.toContain('onClick=');
    expect(sceneryPage).not.toContain('<form');
  });
});

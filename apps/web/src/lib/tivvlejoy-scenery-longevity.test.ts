import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SYNTHETIC_APPROVED_ASSETS,
  buildApprovedAssetRegistry,
  largeSyntheticRegistry,
  syntheticRegistry,
} from './tivvlejoy-approved-asset-registry';
import { sceneryCoverageReport } from './tivvlejoy-world-builder';
import {
  DEFAULT_RECENT_WINDOW_SIZE,
  InvalidLongevityTargetError,
  caveSpecialtyPlan,
  defaultLongevityInput,
  environmentVisualSignatureSha256,
  evaluateDefaultTarget,
  evaluateSceneryLongevity,
  identicalBakeryHistory,
  majorVariantBakeryHistory,
  mixedTivvleJoyHistory,
  productionStyleLongevityInput,
  sameHeroVaryingBackgroundHistory,
  variationStrength,
} from './tivvlejoy-scenery-longevity';

const repoRoot = path.resolve(__dirname, '../../../..');

describe('scenery longevity contracts', () => {
  it('rejects a zero or negative episode target instead of inventing a ceiling', () => {
    expect(() => evaluateSceneryLongevity(defaultLongevityInput({ requestedEpisodeCount: 0 }))).toThrow(InvalidLongevityTargetError);
    expect(() => evaluateSceneryLongevity(defaultLongevityInput({ requestedEpisodeCount: -5 }))).toThrow(InvalidLongevityTargetError);
  });

  it('evaluates a caller-supplied target and does not return a maximum episode count', () => {
    const report = evaluateDefaultTarget(60);
    expect(report.requestedEpisodeCount).toBe(60);
    expect(report.evaluatedEpisodeCount).toBe(60);
    expect(report.seasonTargetSummary).toContain('60-EPISODE TARGET');
    expect(JSON.stringify(report)).not.toMatch(/maximum episodes/i);
    expect(report).not.toHaveProperty('maximumEpisodeCount');
    expect(report).not.toHaveProperty('estimatedEpisodeCoverage');
  });

  it('removes the hard-coded 48 metric from production coverage and longevity source', () => {
    const coverage = readFileSync(path.join(repoRoot, 'apps/web/src/lib/tivvlejoy-world-builder/coverage.ts'), 'utf8');
    const longevity = readFileSync(path.join(repoRoot, 'apps/web/src/lib/tivvlejoy-scenery-longevity/evaluate.ts'), 'utf8');
    expect(coverage).not.toContain('estimatedEpisodeCoverage: 48');
    expect(longevity).not.toContain('estimatedEpisodeCoverage');
    expect(longevity).not.toMatch(/maximumEpisodeCount\s*=\s*\d+/);
    expect(sceneryCoverageReport()).not.toHaveProperty('estimatedEpisodeCoverage');
    expect(sceneryCoverageReport().seasonTargetEvaluation).toBeNull();
    expect(sceneryCoverageReport({ requestedEpisodeCount: 60 }).seasonTargetEvaluation).toContain('60-EPISODE TARGET');
  });

  it('keeps synthetic-only confidence LOW and production-style plans HIGH', () => {
    expect(evaluateSceneryLongevity(defaultLongevityInput()).coverageConfidence).toBe('LOW');
    expect(evaluateSceneryLongevity(productionStyleLongevityInput()).coverageConfidence).toBe('HIGH');
    expect(evaluateSceneryLongevity(productionStyleLongevityInput({ episodeUsageHistory: [], plannedEpisodeRequirements: [] })).coverageConfidence).toBe('MEDIUM');
  });

  it('is deterministic and ignores input order, filenames, and display labels', () => {
    const base = defaultLongevityInput();
    const shuffled = defaultLongevityInput({
      worldBuilderLocations: [...(base.worldBuilderLocations ?? [])].reverse(),
      worldBuilderArchetypes: [...(base.worldBuilderArchetypes ?? [])].reverse(),
      episodeUsageHistory: [...(base.episodeUsageHistory ?? [])].reverse(),
      approvedAssetRegistry: buildApprovedAssetRegistry({
        assets: [...(base.approvedAssetRegistry?.assets ?? [])].reverse(),
      }),
    });
    const a = evaluateSceneryLongevity(base);
    const b = evaluateSceneryLongevity(shuffled);
    expect(a.reportSha256).toBe(b.reportSha256);
    expect(a.repetitionRisk.scoreSha256).toBe(b.repetitionRisk.scoreSha256);
    const labeled = identicalBakeryHistory(2);
    expect(environmentVisualSignatureSha256(labeled[0]!)).toBe(environmentVisualSignatureSha256(labeled[1]!));
    expect(environmentVisualSignatureSha256({ ...labeled[0]!, originalFilename: 'other.zip', displayLabel: 'Other' })).toBe(
      environmentVisualSignatureSha256(labeled[0]!),
    );
  });

  it('does not treat episode number as part of the visual signature', () => {
    const [first, second] = identicalBakeryHistory(2);
    expect(environmentVisualSignatureSha256(first!)).toBe(environmentVisualSignatureSha256(second!));
  });
});

describe('usage history and repetition', () => {
  it('raises risk when every episode shares the same visual signature', () => {
    const report = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 12,
        episodeUsageHistory: identicalBakeryHistory(12),
      }),
    );
    expect(['HIGH', 'VERY_HIGH']).toContain(report.repetitionRisk.overallRisk);
    expect(report.repetitionRisk.consecutiveSimilarityRisk).toBe('VERY_HIGH');
    expect(report.repetitionRisk.recentWindowAnalysis.longestConsecutiveIdenticalSignatures).toBeGreaterThanOrEqual(3);
    expect(report.repetitionRisk.reasons.some((reason) => /consecutive identical/i.test(reason))).toBe(true);
  });

  it('lowers risk when the same base location uses major seasonal and location variants', () => {
    const identical = evaluateSceneryLongevity(defaultLongevityInput({ requestedEpisodeCount: 8, episodeUsageHistory: identicalBakeryHistory(5) }));
    const varied = evaluateSceneryLongevity(defaultLongevityInput({ requestedEpisodeCount: 8, episodeUsageHistory: majorVariantBakeryHistory() }));
    expect(['VERY_LOW', 'LOW']).toContain(varied.repetitionRisk.overallRisk);
    expect(varied.repetitionRisk.consecutiveSimilarityRisk).toBe('VERY_LOW');
    expect(['HIGH', 'VERY_HIGH']).toContain(identical.repetitionRisk.overallRisk);
  });

  it('keeps mixed location and archetype histories at low risk', () => {
    const report = evaluateSceneryLongevity(defaultLongevityInput({ requestedEpisodeCount: 12, episodeUsageHistory: mixedTivvleJoyHistory(12) }));
    expect(['VERY_LOW', 'LOW']).toContain(report.repetitionRisk.overallRisk);
  });

  it('flags three identical bakery mornings in a row', () => {
    const report = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 6,
        episodeUsageHistory: identicalBakeryHistory(3),
        recentWindowSize: 3,
      }),
    );
    expect(report.repetitionRisk.consecutiveSimilarityRisk).toBe('VERY_HIGH');
  });

  it('still shows hero reuse pressure when backgrounds and props vary', () => {
    const report = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 10,
        episodeUsageHistory: sameHeroVaryingBackgroundHistory(10),
      }),
    );
    expect(['MODERATE', 'HIGH', 'VERY_HIGH']).toContain(report.repetitionRisk.heroSetReuseRisk);
    expect(report.heroReusePressure === 'UNDERUSED').toBe(false);
  });

  it('does not let many props hide a single hero location', () => {
    const report = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 10,
        episodeUsageHistory: sameHeroVaryingBackgroundHistory(10),
      }),
    );
    expect(report.locationLoad.find((item) => item.locationId === 'bakery')?.recentUses).toBeGreaterThan(0);
    expect(['MODERATE', 'HIGH', 'VERY_HIGH']).toContain(report.repetitionRisk.locationReuseRisk);
  });

  it('keeps risk elevated when theoretical variants exist but recent signatures are identical', () => {
    const report = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 20,
        seasonCapabilities: ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'],
        weatherCapabilities: ['CLEAR', 'RAIN', 'SNOW', 'FOG'],
        episodeUsageHistory: identicalBakeryHistory(10),
      }),
    );
    expect(['HIGH', 'VERY_HIGH']).toContain(report.repetitionRisk.overallRisk);
    expect(report.variationCapacity.cartesianProductRejected).toBe(true);
  });

  it('classifies bakery morning to forest rain as a MAJOR visual change', () => {
    const [morning, rain] = majorVariantBakeryHistory();
    expect(variationStrength(morning!, rain!)).toBe('MAJOR');
  });
});

describe('registry integration and growth', () => {
  it('counts selectable approved logical identities, not files or wrappers', () => {
    const report = evaluateSceneryLongevity(defaultLongevityInput());
    expect(report.approvedLogicalAssetCount).toBeGreaterThan(0);
    expect(report.approvedLogicalAssetCount).toBeLessThan(syntheticRegistry().assets.length);
  });

  it('excludes DUPLICATE, ARCHIVAL, and BLOCKED assets from capacity', () => {
    const base = evaluateSceneryLongevity(defaultLongevityInput({ approvedAssetRegistry: buildApprovedAssetRegistry({ assets: [SYNTHETIC_APPROVED_ASSETS.villageHero] }) }));
    const duplicate = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({
          assets: [SYNTHETIC_APPROVED_ASSETS.villageHero, SYNTHETIC_APPROVED_ASSETS.duplicateTree],
        }),
      }),
    );
    const archival = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({
          assets: [SYNTHETIC_APPROVED_ASSETS.villageHero, SYNTHETIC_APPROVED_ASSETS.archivalWrapper],
        }),
      }),
    );
    const blocked = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({
          assets: [SYNTHETIC_APPROVED_ASSETS.villageHero, SYNTHETIC_APPROVED_ASSETS.blockedAsset],
        }),
      }),
    );
    expect(duplicate.approvedLogicalAssetCount).toBe(base.approvedLogicalAssetCount);
    expect(archival.approvedLogicalAssetCount).toBe(base.approvedLogicalAssetCount);
    expect(blocked.approvedLogicalAssetCount).toBe(base.approvedLogicalAssetCount);
    expect(duplicate.approvedInteriorShellCount).toBe(base.approvedInteriorShellCount);
  });

  it('improves interior pressure when a new compatible interior is approved', () => {
    const thin = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 80,
        approvedAssetRegistry: buildApprovedAssetRegistry({ assets: [SYNTHETIC_APPROVED_ASSETS.villageHero] }),
      }),
    );
    const richer = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 80,
        approvedAssetRegistry: buildApprovedAssetRegistry({
          assets: [SYNTHETIC_APPROVED_ASSETS.villageHero, SYNTHETIC_APPROVED_ASSETS.tavernShell],
        }),
      }),
    );
    const order = { UNDERUSED: 0, HEALTHY: 1, BUSY: 2, OVERUSED: 3 };
    expect(order[richer.interiorReusePressure]).toBeLessThanOrEqual(order[thin.interiorReusePressure]);
    expect(richer.approvedInteriorShellCount).toBeGreaterThan(thin.approvedInteriorShellCount);
  });

  it('improves or stabilizes background diversity when a mountain background is added', () => {
    const before = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({ assets: [SYNTHETIC_APPROVED_ASSETS.villageHero] }),
      }),
    );
    const after = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({
          assets: [SYNTHETIC_APPROVED_ASSETS.villageHero, SYNTHETIC_APPROVED_ASSETS.mountainBackground],
        }),
      }),
    );
    expect(after.mountainBackgroundCount).toBeGreaterThan(before.mountainBackgroundCount);
    expect(after.backgroundFamilyCount).toBeGreaterThanOrEqual(before.backgroundFamilyCount);
  });

  it('does not let an irrelevant, duplicate, archival, or blocked asset fake improvement', () => {
    const before = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 80,
        approvedAssetRegistry: buildApprovedAssetRegistry({ assets: [SYNTHETIC_APPROVED_ASSETS.villageHero] }),
      }),
    );
    const irrelevant = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 80,
        approvedAssetRegistry: buildApprovedAssetRegistry({
          assets: [SYNTHETIC_APPROVED_ASSETS.villageHero, SYNTHETIC_APPROVED_ASSETS.signage],
        }),
      }),
    );
    expect(irrelevant.approvedInteriorShellCount).toBe(before.approvedInteriorShellCount);
    expect(irrelevant.interiorReusePressure).toBe(before.interiorReusePressure);
  });

  it('stays deterministic on a 320+ asset registry', () => {
    const large = largeSyntheticRegistry(320);
    const a = evaluateSceneryLongevity(defaultLongevityInput({ approvedAssetRegistry: large, requestedEpisodeCount: 60 }));
    const b = evaluateSceneryLongevity(defaultLongevityInput({ approvedAssetRegistry: large, requestedEpisodeCount: 60 }));
    expect(a.reportSha256).toBe(b.reportSha256);
    expect(a.approvedLogicalAssetCount).toBeGreaterThan(300);
  });
});

describe('targets, gaps, and purchase policy', () => {
  it('evaluates 10, 30, 60, 100, and 150+ without code changes and without lowering risk as demand doubles', () => {
    const ten = evaluateDefaultTarget(10);
    const thirty = evaluateDefaultTarget(30);
    const sixty = evaluateDefaultTarget(60);
    const hundred = evaluateDefaultTarget(100);
    const oneFifty = evaluateDefaultTarget(150);
    const rank = { EXCELLENT: 4, STRONG: 3, ADEQUATE: 2, THIN: 1, INSUFFICIENT: 0 };
    const risk = { VERY_LOW: 0, LOW: 1, MODERATE: 2, HIGH: 3, VERY_HIGH: 4 };
    expect(rank[thirty.coverageStrength]).toBeLessThanOrEqual(rank[ten.coverageStrength]);
    expect(rank[sixty.coverageStrength]).toBeLessThanOrEqual(rank[thirty.coverageStrength]);
    expect(rank[hundred.coverageStrength]).toBeLessThanOrEqual(rank[sixty.coverageStrength]);
    expect(rank[oneFifty.coverageStrength]).toBeLessThanOrEqual(rank[hundred.coverageStrength]);
    expect(risk[hundred.repetitionRisk.overallRisk]).toBeGreaterThanOrEqual(risk[thirty.repetitionRisk.overallRisk]);
    expect(risk[oneFifty.repetitionRisk.overallRisk]).toBeGreaterThanOrEqual(risk[sixty.repetitionRisk.overallRisk]);
    expect(sixty.seasonTargetSummary).not.toContain('48');
    expect(oneFifty.requestedEpisodeCount).toBe(150);
  });

  it('does not flag a specialty gap without story demand', () => {
    const report = evaluateSceneryLongevity(defaultLongevityInput({ plannedEpisodeRequirements: [] }));
    expect(report.specialtyGapCount).toBe(0);
    expect(report.purchaseDecision).not.toBe('PURCHASE_MAY_BE_JUSTIFIED');
    expect(report.purchaseSemanticGap).toBeNull();
  });

  it('does not recommend purchase when a procedural or approved solution exists', () => {
    const procedural = evaluateSceneryLongevity(
      defaultLongevityInput({
        plannedEpisodeRequirements: [{ ...caveSpecialtyPlan()[0]!, nativeProceduralSufficient: true }],
      }),
    );
    expect(procedural.purchaseDecision).toBe('NO_PURCHASE_NEEDED');
    const approved = evaluateSceneryLongevity(
      defaultLongevityInput({
        plannedEpisodeRequirements: [{ episodeId: 'EP_BAKERY', requiredHeroRoles: ['BUILDING_HERO'], storyPurpose: 'open bakery' }],
      }),
    );
    expect(approved.purchaseDecision).not.toBe('PURCHASE_MAY_BE_JUSTIFIED');
  });

  it('justifies purchase only for a concrete unresolved semantic story role', () => {
    const report = evaluateSceneryLongevity(defaultLongevityInput({ plannedEpisodeRequirements: caveSpecialtyPlan() }));
    expect(report.purchaseDecision).toBe('PURCHASE_MAY_BE_JUSTIFIED');
    expect(report.purchaseSemanticGap).toBe('CAVE_HERO_CRYSTAL');
    expect(report.specialtyGaps[0]?.semanticRole).toBe('CAVE_HERO_CRYSTAL');
  });

  it('reports location, archetype, hero, interior, and background pressure separately', () => {
    const report = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 60,
        episodeUsageHistory: identicalBakeryHistory(8),
      }),
    );
    expect(report.locationLoad.some((item) => item.locationId === 'bakery')).toBe(true);
    expect(report.archetypeLoad.some((item) => item.archetypeId === 'BAKERY_EXTERIOR')).toBe(true);
    expect(report.heroEnvironmentCount).toBeGreaterThanOrEqual(0);
    expect(report.approvedInteriorShellCount).toBeGreaterThanOrEqual(0);
    expect(report.backgroundFamilyCount).toBeGreaterThanOrEqual(0);
    expect(report.semanticRoleCoverage.map((item) => item.semanticRole)).toContain('INTERIOR_SHELL');
  });

  it('uses the configured recent window rather than a hard-coded production limit of 10', () => {
    expect(DEFAULT_RECENT_WINDOW_SIZE).toBe(10);
    const custom = evaluateSceneryLongevity(defaultLongevityInput({ recentWindowSize: 4, episodeUsageHistory: identicalBakeryHistory(8) }));
    expect(custom.repetitionRisk.recentWindowAnalysis.windowSize).toBe(4);
    expect(custom.repetitionRisk.recentWindowAnalysis.analyzedEpisodeCount).toBe(4);
  });

  it('can say the scenery system supports a requested 60-episode season without a 48 cap', () => {
    const report = evaluateDefaultTarget(60);
    expect(['EXCELLENT', 'STRONG', 'ADEQUATE']).toContain(report.coverageStrength);
    expect(report.longevitySignals.some((signal) => /not a scenery ceiling/i.test(signal))).toBe(true);
    expect(report.syntheticPlanningAnalysis).toBe(true);
  });

  it('excludes missing-receipt, hash-invalid, license-blocked, and quarantined assets', () => {
    const clean = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({ assets: [SYNTHETIC_APPROVED_ASSETS.villageHero] }),
      }),
    );
    const dirty = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({
          assets: [
            SYNTHETIC_APPROVED_ASSETS.villageHero,
            SYNTHETIC_APPROVED_ASSETS.missingReceipt,
            SYNTHETIC_APPROVED_ASSETS.hashInvalid,
            SYNTHETIC_APPROVED_ASSETS.licenseBlocked,
            SYNTHETIC_APPROVED_ASSETS.quarantinedAsset,
          ],
        }),
      }),
    );
    expect(dirty.approvedLogicalAssetCount).toBe(clean.approvedLogicalAssetCount);
  });

  it('changes the report hash when the requested target changes, not when usage filenames change', () => {
    const sixty = evaluateDefaultTarget(60);
    const hundred = evaluateDefaultTarget(100);
    expect(sixty.reportSha256).not.toBe(hundred.reportSha256);
    const labeled = defaultLongevityInput({
      episodeUsageHistory: identicalBakeryHistory(4).map((item, index) => ({
        ...item,
        originalFilename: `file-${index}.zip`,
        displayLabel: `Label ${index}`,
      })),
    });
    const unlabeled = defaultLongevityInput({
      episodeUsageHistory: identicalBakeryHistory(4).map((item) => {
        const { originalFilename: _filename, displayLabel: _label, ...rest } = item;
        return rest;
      }),
    });
    expect(evaluateSceneryLongevity(labeled).reportSha256).toBe(evaluateSceneryLongevity(unlabeled).reportSha256);
  });

  it('treats a small time shift as MINOR and a season change as MAJOR', () => {
    const morning = identicalBakeryHistory(1)[0]!;
    expect(variationStrength(morning, { ...morning, timeOfDay: 'MIDDAY' })).toBe('MINOR');
    expect(variationStrength(morning, { ...morning, season: 'WINTER', weather: 'SNOW', timeOfDay: 'NIGHT_COZY' })).toBe('MAJOR');
  });

  it('does not flag amusement, coastal, or desert specialties without planned story demand', () => {
    const report = evaluateDefaultTarget(60);
    expect(report.specialtyGaps.map((gap) => gap.semanticRole)).not.toContain('AMUSEMENT_RIDE_HERO');
    expect(report.specialtyGaps.map((gap) => gap.semanticRole)).not.toContain('COASTAL_HERO');
    expect(report.specialtyGaps.map((gap) => gap.semanticRole)).not.toContain('DESERT_HERO');
  });

  it('marks optional expansion only when reuse pressure is high and no semantic gap exists', () => {
    const report = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 12,
        plannedEpisodeRequirements: [],
        episodeUsageHistory: identicalBakeryHistory(12),
      }),
    );
    expect(report.specialtyGapCount).toBe(0);
    expect(['NO_PURCHASE_NEEDED', 'OPTIONAL_EXPANSION']).toContain(report.purchaseDecision);
    expect(report.purchaseDecision).not.toBe('PURCHASE_MAY_BE_JUSTIFIED');
  });

  it('returns LOW confidence when no approved registry is supplied', () => {
    const report = evaluateSceneryLongevity({
      requestedEpisodeCount: 60,
      evidenceClass: 'APPROVED_PRODUCTION_PLAN',
    });
    expect(report.coverageConfidence).toBe('LOW');
    expect(report.approvedLogicalAssetCount).toBe(0);
  });

  it('does not invent an episode capacity when sceneryCoverageReport has no target', () => {
    const report = sceneryCoverageReport();
    expect(report.coverageStrength).toBeNull();
    expect(report.repetitionRisk).toBeNull();
    expect(report.episodeCapacityInvented).toBe(false);
  });

  it('keeps Preview World Builder copy free of the old 48-episode claim', () => {
    const ui = readFileSync(path.join(repoRoot, 'apps/web/src/components/preview/WorldBuilder.tsx'), 'utf8');
    expect(ui).toContain('SCENERY LONGEVITY');
    expect(ui).not.toMatch(/48 episode/i);
    expect(ui).not.toContain('estimatedEpisodeCoverage');
  });

  it('exposes explainable reasons for a moderate or higher risk result', () => {
    const report = evaluateSceneryLongevity(
      defaultLongevityInput({
        requestedEpisodeCount: 8,
        episodeUsageHistory: identicalBakeryHistory(8),
      }),
    );
    expect(report.repetitionRisk.reasons.length).toBeGreaterThan(1);
    expect(report.repetitionRisk.reasons.join(' ')).toMatch(/bakery|interior|consecutive|signature/i);
  });

  it('counts canonical groups so ten copies of one tree are not ten choices', () => {
    const one = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({ assets: [SYNTHETIC_APPROVED_ASSETS.forestHeroTree] }),
      }),
    );
    const copies = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({
          assets: [
            SYNTHETIC_APPROVED_ASSETS.forestHeroTree,
            { ...SYNTHETIC_APPROVED_ASSETS.duplicateTree, canonicalGroupId: SYNTHETIC_APPROVED_ASSETS.forestHeroTree.canonicalGroupId },
          ],
        }),
      }),
    );
    expect(copies.approvedLogicalAssetCount).toBe(one.approvedLogicalAssetCount);
  });

  it('uses a default analysis window of 10 without treating it as a production episode limit', () => {
    const report = evaluateSceneryLongevity(defaultLongevityInput({ episodeUsageHistory: mixedTivvleJoyHistory(20) }));
    expect(report.repetitionRisk.recentWindowAnalysis.windowSize).toBe(10);
    expect(report.requestedEpisodeCount).toBe(60);
  });

  it('does not count a Botaniq upload-only record as approved scenery capacity', () => {
    const without = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({ assets: [SYNTHETIC_APPROVED_ASSETS.villageHero] }),
      }),
    );
    const withBotaniq = evaluateSceneryLongevity(
      defaultLongevityInput({
        approvedAssetRegistry: buildApprovedAssetRegistry({
          assets: [SYNTHETIC_APPROVED_ASSETS.villageHero, SYNTHETIC_APPROVED_ASSETS.botaniqUploadOnly],
        }),
      }),
    );
    expect(withBotaniq.approvedLogicalAssetCount).toBe(without.approvedLogicalAssetCount);
  });

  it('keeps interior analysis labeled as synthetic when Preview evidence is used', () => {
    const report = evaluateDefaultTarget(60);
    expect(report.syntheticPlanningAnalysis).toBe(true);
    expect(report.evidenceClass).toBe('SYNTHETIC_PREVIEW');
    expect(report.approvedInteriorShellCount).toBeGreaterThanOrEqual(0);
    expect(report.longevitySignals.join(' ')).toMatch(/SYNTHETIC \/ PLANNING ANALYSIS/i);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPrivateObjectInventory } from './tivvlejoy-real-input-convergence/inventory';
import { make136StyleListing, make500SourceListing } from './tivvlejoy-real-input-convergence/fixtures';
import {
  BLENDER_TARGET_VERSION,
  COMMERCIAL_GATE_KEYS,
  DO_NOT_REBUILD_MATRIX,
  EP012_VOICE_LINES,
  FIRST_READ_PLAN_SCHEMA,
  RIG_ARRIVAL_CHECKLIST_LABELS,
  UNBLOCK_BUCKETS,
  assertNoDownloadWithoutProvenZero,
  blenderTrustAllowsInstall,
  buildFirstEpisodeOperatorModel,
  checklistAutoApprovalCount,
  compileDoNotRebuildMatrix,
  compileEp012RealVoiceGenerationPlan,
  compileFirstEpisodeExternalDependencies,
  compileFirstEpisodeSceneryMinimum,
  compileFirstEpisodeUnblockOrder,
  compileFirstRealSourceReadPlan,
  compileInspectionOrder,
  compileRealProductionTodoLedger,
  compileRealProductionUnblock,
  compileRigArrivalChecklist,
  compileRigHandoffPackage,
  compileTrustedBlenderBootstrap,
  compileVoiceCostPreflight,
  compileVoiceTimingWorkflow,
  countSpokenCharacters,
  emptyCommercialGateSatisfied,
  evaluateCommercialBlenderInspectionGate,
  evaluateRealReadCostGate,
  evaluateSyntheticBlenderAcceptance,
  mayOpenCommercialBlend,
  mayPerformCommercialGet,
  missingRealVoiceLines,
  requiredRigReceiveFiles,
  selectFirstRealSources,
  shouldRebuildStudioSystem,
  shouldStopInspection,
} from './tivvlejoy-real-production-unblock';

function inventoryFrom(items: ReturnType<typeof make136StyleListing>) {
  return buildPrivateObjectInventory({
    items,
    listingExecuted: true,
    realPrivateSourceAccessAvailable: true,
  });
}

function fixturePlan() {
  return compileFirstRealSourceReadPlan(inventoryFrom(make136StyleListing()));
}

describe('TIVVLEJOY_FIRST_REAL_SOURCE_READ_PLAN_V1', () => {
  it('does not hard-code 136 in the selector', () => {
    const source = readFileSync(path.resolve(__dirname, 'tivvlejoy-real-production-unblock/first-read-plan.ts'), 'utf8');
    expect(source).not.toMatch(/\b136\b/);
  });

  it('uses the observed listing count from inventory', () => {
    const plan = fixturePlan();
    expect(plan.schemaVersion).toBe(FIRST_READ_PLAN_SCHEMA);
    expect(plan.listedObjectCount).toBe(make136StyleListing().length);
    expect(plan.hardcodedObjectTotal).toBe(false);
  });

  it('selects the direct GLB', () => {
    expect(fixturePlan().selected.some((item) => item.family === 'direct_glb')).toBe(true);
  });

  it('selects the smallest mountain object', () => {
    const mountain = fixturePlan().selected.find((item) => item.family === 'mountain');
    expect(mountain?.size).toBe(3 * 1024 * 1024);
  });

  it('selects tavern FBX when present', () => {
    const tavern = fixturePlan().selected.find((item) => item.family === 'tavern_fbx');
    expect(tavern?.format).toBe('fbx');
  });

  it('skips tavern textures when none exist as standalone objects', () => {
    expect(fixturePlan().selected.some((item) => item.family === 'tavern_texture')).toBe(false);
  });

  it('selects the smallest village and forest sources', () => {
    const plan = fixturePlan();
    expect(plan.selected.some((item) => item.family === 'village')).toBe(true);
    expect(plan.selected.some((item) => item.family === 'forest')).toBe(true);
  });

  it('selects one sky source', () => {
    expect(fixturePlan().selected.filter((item) => item.family === 'sky_hdri')).toHaveLength(1);
  });

  it('avoids Botaniq', () => {
    const plan = fixturePlan();
    expect(plan.selected.every((item) => !/botaniq/i.test(item.operatorLabel))).toBe(true);
    expect(plan.avoided.some((item) => /botaniq/i.test(item.reason))).toBe(true);
  });

  it('avoids huge packages', () => {
    expect(fixturePlan().selected.every((item) => item.size < 900_000_000)).toBe(true);
  });

  it('skips an oversized direct GLB instead of treating size as proof of usefulness', () => {
    const plan = compileFirstRealSourceReadPlan(
      inventoryFrom([
        { key: 'tivvlejoy-assets/source/mountain/huge.glb', size: 1_548_419_288, etag: 'huge-glb' },
        { key: 'tivvlejoy-assets/source/village/small.zip', size: 2_148_090, etag: 'village' },
      ]),
    );
    expect(plan.selected.some((item) => item.family === 'direct_glb')).toBe(false);
    expect(plan.selected.some((item) => item.family === 'village')).toBe(true);
    expect(plan.avoided.some((item) => item.reason.includes('Huge package'))).toBe(true);
  });

  it('does not select receipt JSON as scenery', () => {
    expect(fixturePlan().selected.every((item) => item.format !== 'json')).toBe(true);
  });

  it('marks every selected object as requiring user consent', () => {
    expect(fixturePlan().selected.every((item) => item.requiresUserAuthorization)).toBe(true);
  });

  it('leaves cost estimates unknown', () => {
    const selected = fixturePlan().selected[0];
    expect(selected?.estimatedStorageOperationCost).toBe('UNKNOWN');
    expect(selected?.estimatedDataTransferCost).toBe('UNKNOWN');
    expect(selected?.costConfidence).toBe('NONE');
  });

  it('does not expose secret object URLs', () => {
    const json = JSON.stringify(fixturePlan());
    expect(json).not.toMatch(/X-Amz-|signedUrl|https:\/\/.*r2/);
    expect(fixturePlan().secretUrlsExposed).toBe(false);
  });

  it('records zero commercial bytes downloaded', () => {
    expect(fixturePlan().commercialBytesDownloaded).toBe(0);
  });

  it('changes selection when the listing changes instead of assuming a fixed total', () => {
    const onlyGlb = compileFirstRealSourceReadPlan(
      inventoryFrom([{ key: 'tivvlejoy-assets/source/mountain/only.glb', size: 12_000, etag: 'e1' }]),
    );
    expect(onlyGlb.listedObjectCount).toBe(1);
    expect(onlyGlb.selectedObjectCount).toBe(1);
    expect(onlyGlb.selected[0]?.family).toBe('direct_glb');
  });

  it('selects nothing useful from an unrelated 500-object listing', () => {
    const plan = compileFirstRealSourceReadPlan(inventoryFrom(make500SourceListing()));
    expect(plan.listedObjectCount).toBe(500);
    expect(plan.selectedObjectCount).toBe(0);
  });

  it('prefers tavern FBX over a larger tavern zip', () => {
    const plan = fixturePlan();
    const tavern = plan.selected.find((item) => item.family === 'tavern_fbx');
    expect(tavern?.size).toBe(22_000);
  });

  it('keeps selected total bytes equal to the sum of selected sizes', () => {
    const plan = fixturePlan();
    expect(plan.selectedTotalBytes).toBe(plan.selected.reduce((sum, item) => sum + item.size, 0));
  });

  it('assigns expected semantic roles to each family', () => {
    const glb = fixturePlan().selected.find((item) => item.family === 'direct_glb');
    expect(glb?.expectedSemanticRoles).toEqual(expect.arrayContaining(['BUILDING_HERO', 'SIGNAGE']));
  });

  it('returns a sourceId and hashed object identity for every selected object', () => {
    expect(fixturePlan().selected.every((item) => item.sourceId.startsWith('src_') && item.objectIdentity.length === 64)).toBe(true);
  });

  it('selectFirstRealSources is deterministic', () => {
    const inventory = inventoryFrom(make136StyleListing());
    expect(selectFirstRealSources(inventory)).toEqual(selectFirstRealSources(inventory));
  });
});

describe('zero-cost verification', () => {
  it('fails closed when cost is unknown', () => {
    const decision = evaluateRealReadCostGate(fixturePlan());
    expect(decision.state).toBe('REAL_READ_AUTHORIZATION_REQUIRED');
    expect(decision.provenZero).toBe(false);
    expect(decision.costState).toBe('UNKNOWN');
  });

  it('returns selected bytes and object count', () => {
    const plan = fixturePlan();
    const decision = evaluateRealReadCostGate(plan);
    expect(decision.totalBytes).toBe(plan.selectedTotalBytes);
    expect(decision.objectCount).toBe(plan.selectedObjectCount);
  });

  it('does not invent a best or worst dollar estimate', () => {
    const decision = evaluateRealReadCostGate(fixturePlan());
    expect(decision.bestEstimate).toBe('UNKNOWN');
    expect(decision.worstReasonableEstimate).toBe('UNKNOWN');
  });

  it('lists unknown cost variables', () => {
    expect(evaluateRealReadCostGate(fixturePlan()).unknownCostVariables.length).toBeGreaterThan(2);
  });

  it('refuses download when cost is not proven zero', () => {
    expect(mayPerformCommercialGet(evaluateRealReadCostGate(fixturePlan()))).toBe(false);
  });

  it('throws if a caller marks a download without proven zero', () => {
    expect(() =>
      assertNoDownloadWithoutProvenZero({
        ...evaluateRealReadCostGate(fixturePlan()),
        downloadPerformed: true,
      } as never),
    ).toThrow(/REFUSED_UNPROVEN_COMMERCIAL_GET/);
  });

  it('records no mutation', () => {
    expect(evaluateRealReadCostGate(fixturePlan()).mutation).toBe(false);
  });
});

describe('first-episode scenery minimum', () => {
  it('evaluates EP012 only', () => {
    expect(compileFirstEpisodeSceneryMinimum().episodeId).toBe('EP012');
  });

  it('uses bakery and forest_exit from the actual plan', () => {
    expect(compileFirstEpisodeSceneryMinimum().locationIds).toEqual(expect.arrayContaining(['bakery', 'forest_exit']));
  });

  it('requires building, signage, street prop, story prop, path, sky, and background', () => {
    const required = compileFirstEpisodeSceneryMinimum().required;
    expect(required).toEqual(expect.arrayContaining([
      'BUILDING_HERO',
      'SIGNAGE',
      'STREET_PROP',
      'STORY_PROP',
      'PATH',
      'SKY',
      'BACKGROUND_FILL',
    ]));
  });

  it('requires forest support roles because EP012 has a forest-exit closer', () => {
    expect(compileFirstEpisodeSceneryMinimum().required).toEqual(expect.arrayContaining(['TREE_SUPPORT', 'FOREGROUND_FRAME', 'TERRAIN_SURFACE']));
  });

  it('keeps interior roles optional', () => {
    const scenery = compileFirstEpisodeSceneryMinimum();
    expect(scenery.optional).toEqual(expect.arrayContaining(['INTERIOR_SHELL', 'INTERIOR_PROP']));
    expect(scenery.interiorRequired).toBe(false);
  });

  it('marks sky as native-procedural-capable', () => {
    expect(compileFirstEpisodeSceneryMinimum().nativeProceduralCapable).toEqual(['SKY']);
  });

  it('requires library originals for non-sky required roles', () => {
    const scenery = compileFirstEpisodeSceneryMinimum();
    expect(scenery.mustComeFromApprovedLibrary).toContain('BUILDING_HERO');
    expect(scenery.mustComeFromApprovedLibrary).not.toContain('SKY');
  });

  it('names the story map', () => {
    expect(compileFirstEpisodeSceneryMinimum().storyPropIds).toContain('PROP_STORY_MAP');
  });

  it('refuses a non-EP012 plan', () => {
    expect(() => compileFirstEpisodeSceneryMinimum({ episodeId: 'EP013', shots: [] })).toThrow(/EP012/);
  });
});

describe('first real inspection order', () => {
  it('orders by required-role coverage per byte', () => {
    const plan = fixturePlan();
    const scenery = compileFirstEpisodeSceneryMinimum();
    const order = compileInspectionOrder({ plan, scenery });
    const again = compileInspectionOrder({ plan, scenery });
    expect(order.inspectionOrder.map((item) => item.sourceId)).toEqual(again.inspectionOrder.map((item) => item.sourceId));
    expect(order.inspectionOrder.map((item) => item.order)).toEqual(order.inspectionOrder.map((_, index) => index + 1));
    expect(order.inspectionOrder[0]?.bytes).toBeLessThan(1_000_000);
  });

  it('accumulates bytes', () => {
    const order = compileInspectionOrder({ plan: fixturePlan(), scenery: compileFirstEpisodeSceneryMinimum() });
    expect(order.cumulativeBytes).toBe(order.inspectionOrder.at(-1)?.cumulativeBytes);
    expect(order.inspectionOrder.every((item, index, all) => index === 0 || item.cumulativeBytes >= all[index - 1]!.cumulativeBytes)).toBe(true);
  });

  it('covers expected EP012 roles from the small set', () => {
    const order = compileInspectionOrder({ plan: fixturePlan(), scenery: compileFirstEpisodeSceneryMinimum() });
    expect(order.expectedRoleCoverage).toEqual(expect.arrayContaining(['BUILDING_HERO', 'PATH', 'TREE_SUPPORT', 'SKY']));
  });

  it('states the stop-after-evidence condition', () => {
    expect(compileInspectionOrder({ plan: fixturePlan(), scenery: compileFirstEpisodeSceneryMinimum() }).stopAfterEvidenceCondition).toMatch(/Stop downloading/);
  });

  it('stops when required roles are already covered', () => {
    const required = compileFirstEpisodeSceneryMinimum().required;
    expect(shouldStopInspection({ covered: required, required })).toBe(true);
    expect(shouldStopInspection({ covered: ['SKY'], required })).toBe(false);
  });
});

describe('trusted Blender bootstrap', () => {
  it('targets the project pin 4.2.2', () => {
    expect(BLENDER_TARGET_VERSION).toBe('4.2.2');
    expect(compileTrustedBlenderBootstrap().targetVersion).toBe('4.2.2');
  });

  it('uses only the official Blender Foundation source', () => {
    expect(compileTrustedBlenderBootstrap().trustedSource).toContain('download.blender.org');
    expect(compileTrustedBlenderBootstrap().trustedSource).not.toMatch(/github\.com\/.*blender/i);
  });

  it('refuses install without an official checksum pin', () => {
    const bootstrap = compileTrustedBlenderBootstrap();
    expect(bootstrap.trustedPinPresent).toBe(false);
    expect(blenderTrustAllowsInstall(bootstrap)).toBe(false);
  });

  it('does not cost money to install later', () => {
    expect(compileTrustedBlenderBootstrap().installationCostsMoney).toBe(false);
  });

  it('does not require root when the cache is user-writable', () => {
    expect(compileTrustedBlenderBootstrap().adminRootNeeded).toBe(false);
  });

  it('treats a cloud install as non-persistent', () => {
    expect(compileTrustedBlenderBootstrap().persistent).toBe(false);
  });

  it('returns an exact later playbook', () => {
    expect(compileTrustedBlenderBootstrap().laterAuthorizationPlaybook.length).toBeGreaterThan(4);
    expect(compileTrustedBlenderBootstrap().laterAuthorizationPlaybook.join('\n')).toMatch(/sha256sum/);
  });
});

describe('synthetic Blender acceptance', () => {
  it('does not run when Blender is missing', () => {
    const result = evaluateSyntheticBlenderAcceptance({ blenderAvailable: false, trustedPinVerified: false });
    expect(result.state).toBe('NOT_RUN');
    expect(result.blocker).toBe('BLENDER_NOT_INSTALLED');
  });

  it('blocks an untrusted binary even if one is on PATH', () => {
    const result = evaluateSyntheticBlenderAcceptance({ blenderAvailable: true, trustedPinVerified: false });
    expect(result.state).toBe('BLOCKED');
    expect(result.blocker).toBe('BLENDER_TRUST_OR_VERSION_AMBIGUOUS');
  });

  it('passes only a complete synthetic run', () => {
    const result = evaluateSyntheticBlenderAcceptance({
      blenderAvailable: true,
      trustedPinVerified: true,
      executed: {
        version: '4.2.2',
        backgroundLaunch: true,
        factoryStartup: true,
        autoexecDisabled: true,
        pythonApi: true,
        eevee: true,
        cyclesMetadataOnly: true,
        networkIsolation: true,
        temporaryOutput: true,
        cleanShutdown: true,
      },
    });
    expect(result.state).toBe('BLENDER_SYNTHETIC_ACCEPTANCE_PASS');
    expect(result.commercialAssetsLoaded).toBe(false);
    expect(result.pipGoatLoaded).toBe(false);
  });

  it('fails a partial synthetic run', () => {
    const result = evaluateSyntheticBlenderAcceptance({
      blenderAvailable: true,
      trustedPinVerified: true,
      executed: {
        version: '4.2.2',
        backgroundLaunch: true,
        factoryStartup: false,
        autoexecDisabled: true,
        pythonApi: true,
        eevee: true,
        cyclesMetadataOnly: true,
        networkIsolation: true,
        temporaryOutput: true,
        cleanShutdown: true,
      },
    });
    expect(result.state).toBe('BLOCKED');
  });

  it('never claims commercial or Pip/Goat files were loaded', () => {
    const result = evaluateSyntheticBlenderAcceptance({ blenderAvailable: false, trustedPinVerified: false });
    expect(result.commercialAssetsLoaded).toBe(false);
    expect(result.pipGoatLoaded).toBe(false);
  });
});

describe('commercial deep-inspection gate', () => {
  it('is not ready by default', () => {
    const gate = evaluateCommercialBlenderInspectionGate();
    expect(gate.ready).toBe(false);
    expect(mayOpenCommercialBlend(gate)).toBe(false);
  });

  it('requires every named gate', () => {
    expect(COMMERCIAL_GATE_KEYS).toEqual(expect.arrayContaining([
      'sourceHashVerified',
      'temporaryImmutableCopy',
      'factoryStartup',
      'autoExecDisabled',
      'networkBlocked',
      'timeoutArmed',
      'sourceSaveForbidden',
      'addonActivationForbidden',
      'scriptExecutionForbidden',
      'driverPolicyDefined',
      'cleanupArmed',
    ]));
  });

  it('stays closed if only one gate is true', () => {
    const satisfied = emptyCommercialGateSatisfied();
    satisfied.factoryStartup = true;
    expect(evaluateCommercialBlenderInspectionGate(satisfied).ready).toBe(false);
  });

  it('opens only when every gate is true', () => {
    const satisfied = emptyCommercialGateSatisfied();
    for (const key of COMMERCIAL_GATE_KEYS) satisfied[key] = true;
    const gate = evaluateCommercialBlenderInspectionGate(satisfied);
    expect(gate.ready).toBe(true);
    expect(mayOpenCommercialBlend(gate)).toBe(true);
  });
});

describe('EP012 voice-line inventory', () => {
  it('lists exactly the seven missing receipts', () => {
    const plan = compileEp012RealVoiceGenerationPlan();
    expect(plan.lines.map((line) => line.dialogueRef)).toEqual([...EP012_VOICE_LINES]);
    expect(plan.lineCount).toBe(7);
    expect(missingRealVoiceLines(plan)).toHaveLength(7);
  });

  it('binds speakers from the episode beats', () => {
    const byRef = Object.fromEntries(compileEp012RealVoiceGenerationPlan().lines.map((line) => [line.dialogueRef, line.speaker]));
    expect(byRef.DL_DISCOVERY_01).toBe('PIP');
    expect(byRef.DL_DECISION_01).toBe('GOAT');
    expect(byRef.DL_PAYOFF_01).toBe('PIP');
    expect(byRef.DL_BUTTON_01).toBe('PIP_AND_GOAT');
  });

  it('counts Pip, Goat, and shared lines without inventing text', () => {
    const plan = compileEp012RealVoiceGenerationPlan();
    expect(plan.pipLineCount).toBe(2);
    expect(plan.goatLineCount).toBe(1);
    expect(plan.sharedLineCount).toBe(4);
    expect(plan.lines.every((line) => line.characterCount === null && line.textHash === null)).toBe(true);
  });

  it('does not claim a historical real receipt', () => {
    expect(compileEp012RealVoiceGenerationPlan().lines.every((line) => line.historicalRealReceipt === false)).toBe(true);
  });

  it('does not synthesize', () => {
    const plan = compileEp012RealVoiceGenerationPlan();
    expect(plan.generationPerformed).toBe(false);
    expect(plan.lines.every((line) => line.synthesized === false)).toBe(true);
  });

  it('keeps character voice identity bound without exposing vendor IDs in this module', () => {
    const source = readFileSync(path.resolve(__dirname, 'tivvlejoy-real-production-unblock/voice-plan.ts'), 'utf8');
    expect(source).not.toMatch(/voice-identity/);
    expect(compileEp012RealVoiceGenerationPlan().lines.every((line) => line.voiceIdentityBound)).toBe(true);
  });
});

describe('voice character-count determinism', () => {
  it('returns unknown counts until spoken text exists', () => {
    const cost = compileVoiceCostPreflight(compileEp012RealVoiceGenerationPlan());
    expect(cost.state).toBe('VOICE_COST_UNKNOWN_REQUIRES_AUTHORIZATION');
    expect(cost.pipCharacters).toBeNull();
    expect(cost.goatCharacters).toBeNull();
    expect(cost.totalCharacters).toBeNull();
    expect(cost.pricingInvented).toBe(false);
    expect(cost.generated).toBe(false);
  });

  it('expects one generation request per EP012 line', () => {
    expect(compileVoiceCostPreflight(compileEp012RealVoiceGenerationPlan()).expectedGenerationRequests).toBe(7);
  });

  it('counts supplied text deterministically without inventing missing sides', () => {
    expect(countSpokenCharacters({ pipText: 'Hi', goatText: 'Go' })).toEqual({
      pipCharacters: 2,
      goatCharacters: 2,
      totalCharacters: 4,
    });
    expect(countSpokenCharacters({})).toEqual({
      pipCharacters: null,
      goatCharacters: null,
      totalCharacters: null,
    });
  });

  it('does not invent vendor pricing in source', () => {
    const source = readFileSync(path.resolve(__dirname, 'tivvlejoy-real-production-unblock/voice-cost.ts'), 'utf8');
    expect(source).not.toMatch(/0\.30|pricePer|elevenlabs\.com\/pricing/i);
  });
});

describe('voice timing workflow', () => {
  it('does not claim phoneme timing from the vendor by default', () => {
    const timing = compileVoiceTimingWorkflow();
    expect(timing.realGenerationWouldProvide).toEqual(['audio only', 'line timing', 'word timing']);
    expect(timing.workflow).toEqual(['REAL_AUDIO', 'TIMING_EXTRACTION', 'VISEME', 'ANIMATION', 'EDITORIAL', 'CAPTIONS']);
    expect(timing.syntheticTimingMayBeRelabeledReal).toBe(false);
  });
});

describe('rig arrival checklist and handoff', () => {
  it('requires only the Blender source to receive each character', () => {
    const handoff = compileRigHandoffPackage();
    expect(requiredRigReceiveFiles(handoff.pip)).toEqual(['Pip Blender source']);
    expect(requiredRigReceiveFiles(handoff.goat)).toEqual(['Goat Blender source']);
    expect(handoff.filesPresent).toBe(false);
    expect(handoff.operatorHandoffReady).toBe(true);
  });

  it('does not require redundant FBX or GLB when a Blender source is the contract source', () => {
    const handoff = compileRigHandoffPackage();
    expect(handoff.pip.find((item) => item.label === 'Pip FBX')?.required).toBe(false);
    expect(handoff.pip.find((item) => item.label === 'Pip GLB')?.required).toBe(false);
  });

  it('prints every required acceptance row as incomplete', () => {
    const rows = compileRigArrivalChecklist();
    expect(rows.map((row) => row.label)).toEqual([...RIG_ARRIVAL_CHECKLIST_LABELS]);
    expect(rows).toHaveLength(18);
    expect(rows.every((row) => row.complete === false && row.autoApproval === false)).toBe(true);
    expect(checklistAutoApprovalCount(rows)).toBe(0);
  });

  it('includes Pip wings, hallux, and Goat collar/tag rows', () => {
    const labels = compileRigArrivalChecklist().map((row) => row.label);
    expect(labels).toEqual(expect.arrayContaining(['WINGS tested for Pip', 'Pip hallux checked', 'Goat collar/tag stable', 'HUMAN APPROVAL issued']));
  });
});

describe('parallel unblock ordering', () => {
  it('has every required bucket', () => {
    const order = compileFirstEpisodeUnblockOrder();
    expect(Object.keys(order.buckets).sort()).toEqual([...UNBLOCK_BUCKETS].sort());
  });

  it('puts rigger outreach in DO_NOW because rigs have long lead time', () => {
    expect(compileFirstEpisodeUnblockOrder().buckets.DO_NOW.join(' ')).toMatch(/rigger/i);
  });

  it('lets scenery and voice preparation happen while waiting for rigs', () => {
    const waiting = compileFirstEpisodeUnblockOrder().buckets.DO_WHILE_WAITING.join(' ');
    expect(waiting).toMatch(/scenery/i);
    expect(waiting).toMatch(/voice|audio/i);
    expect(waiting).toMatch(/Blender/i);
  });

  it('keeps GPU and billed work behind paid consent', () => {
    const paid = compileFirstEpisodeUnblockOrder().buckets.DO_ONLY_AFTER_PAID_AUTHORIZATION.join(' ');
    expect(paid).toMatch(/GPU|RunPod/i);
    expect(paid).toMatch(/voice/i);
  });
});

describe('do-not-rebuild matrix', () => {
  it('covers the seven systems that must not be rebuilt', () => {
    expect(DO_NOT_REBUILD_MATRIX.map((row) => row.system)).toEqual([
      'persistence',
      'orchestration',
      'animation planning',
      'director',
      'editorial',
      'asset registry',
      'scenery audit',
    ]);
  });

  it('marks each system already sufficient', () => {
    expect(compileDoNotRebuildMatrix().rows.every((row) => row.alreadySufficient)).toBe(true);
  });

  it('allows rebuild only when a real defect exists', () => {
    expect(shouldRebuildStudioSystem('persistence', false)).toBe(false);
    expect(shouldRebuildStudioSystem('persistence', true)).toBe(true);
    expect(shouldRebuildStudioSystem('brand-new-department', false)).toBe(false);
  });

  it('has a checked-in operator matrix document', () => {
    const doc = readFileSync(path.resolve(__dirname, '../../../../docs/TIVVLEJOY_DO_NOT_REBUILD_MATRIX_V1.md'), 'utf8');
    expect(doc).toContain('TIVVLEJOY_DO_NOT_REBUILD_MATRIX_V1');
    expect(doc).toContain('persistence');
    expect(doc).toContain('scenery audit');
  });
});

describe('real-production ledger', () => {
  it('contains only open first-episode work', () => {
    const ledger = compileRealProductionTodoLedger();
    expect(ledger.items.length).toBeGreaterThanOrEqual(8);
    expect(ledger.items.every((item) => item.status === 'OPEN')).toBe(true);
  });

  it('does not invent a completion percentage', () => {
    expect(JSON.stringify(compileRealProductionTodoLedger())).not.toMatch(/% complete|percentComplete/i);
  });

  it('marks rig receive as blocking and external', () => {
    const rigs = compileRealProductionTodoLedger().items.find((item) => item.id === 'TODO_RECEIVE_PRODUCTION_RIGS');
    expect(rigs?.blocking).toBe(true);
    expect(rigs?.ownerClass).toBe('RIGGER');
    expect(rigs?.requiresExternalInput).toBe(true);
  });

  it('keeps paid render behind human consent', () => {
    const render = compileRealProductionTodoLedger().items.find((item) => item.id === 'TODO_PAID_RENDER_LATER');
    expect(render?.costClass).toBe('PAID');
    expect(render?.nextAction).toMatch(/Do not launch GPU/);
  });
});

describe('compileRealProductionUnblock', () => {
  it('compiles a fail-closed report from the fixture listing', async () => {
    const report = await compileRealProductionUnblock({ items: make136StyleListing(), authorizeReads: true });
    expect(report.commercialBytesDownloaded).toBe(0);
    expect(report.voiceGenerationPerformed).toBe(false);
    expect(report.runPodContacted).toBe(false);
    expect(report.cost.state).toBe('REAL_READ_AUTHORIZATION_REQUIRED');
    expect(report.commercialGate.ready).toBe(false);
    expect(report.blenderAcceptance.state === 'NOT_RUN' || report.blenderAcceptance.state === 'BLOCKED').toBe(true);
  });

  it('does not download even when authorizeReads is true', async () => {
    const report = await compileRealProductionUnblock({ items: make136StyleListing(), authorizeReads: true });
    expect(report.cost.downloadPerformed).toBe(false);
    expect(report.firstReadPlan.commercialBytesDownloaded).toBe(0);
  });

  it('builds a morning operator model', async () => {
    const report = await compileRealProductionUnblock({ items: make136StyleListing() });
    const model = buildFirstEpisodeOperatorModel(report);
    expect(model.title).toBe('FIRST REAL EPISODE');
    expect(model.next5Actions).toHaveLength(5);
    expect(model.spendBanner).toBe('DO NOT SPEND MONEY YET');
    expect(model.numberOneBlocker).toMatch(/rig/i);
  });

  it('lists external dependency categories in operator language', () => {
    const categories = compileFirstEpisodeExternalDependencies().map((item) => item.category);
    expect(categories).toEqual([
      'FROM RIGGER',
      'FROM VOICE SYSTEM',
      'FROM SCENERY REVIEW',
      'FROM BLENDER ENVIRONMENT',
      'FROM USER',
      'FROM PAID RENDER LATER',
    ]);
  });
});

describe('operator pages', () => {
  it('upgrades production-control with the first real episode panel', () => {
    const ui = readFileSync(path.resolve(__dirname, '../components/preview/ProductionStudioConsole.tsx'), 'utf8');
    const page = readFileSync(path.resolve(__dirname, '../app/production-control/page.tsx'), 'utf8');
    expect(ui).toContain('FIRST REAL EPISODE');
    expect(ui).toContain('NEXT 5 ACTIONS');
    expect(ui).toContain('DO NOT SPEND MONEY YET');
    expect(page).toContain('compileRealProductionUnblock');
    expect(page).toContain('persistence={persistence}');
  });

  it('keeps production-control labeled as preview data', () => {
    const ui = readFileSync(path.resolve(__dirname, '../components/preview/ProductionStudioConsole.tsx'), 'utf8');
    expect(ui).toContain('PREVIEW / SYNTHETIC PRODUCTION DATA');
    expect(ui).not.toMatch(/Started GPU|Rendered|Uploaded/);
    expect(ui).not.toMatch(/ElevenLabs/);
  });

  it('shows the printable rig checklist on /rig-arrival', () => {
    const ui = readFileSync(path.resolve(__dirname, '../components/preview/RigArrivalConsole.tsx'), 'utf8');
    const page = readFileSync(path.resolve(__dirname, '../app/rig-arrival/page.tsx'), 'utf8');
    expect(ui).toContain('Acceptance checklist');
    expect(page).toContain('compileRigArrivalChecklist');
    expect(page).toContain('compileRigHandoffPackage');
  });
});

describe('safety contracts', () => {
  it('does not implement a commercial GET in this module', () => {
    const dir = path.resolve(__dirname, 'tivvlejoy-real-production-unblock');
    const files = [
      'compile.ts',
      'first-read-plan.ts',
      'cost-gate.ts',
      'blender-bootstrap.ts',
      'blender-acceptance.ts',
    ];
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      expect(source).not.toMatch(/GetObjectCommand|getObject\(|downloadObject|fetch\(.*r2/i);
    }
  });

  it('does not install Blender in this marathon', () => {
    const source = readFileSync(path.resolve(__dirname, 'tivvlejoy-real-production-unblock/blender-bootstrap.ts'), 'utf8');
    expect(source).not.toMatch(/spawnSync\(|execSync\(|curl /);
  });
});

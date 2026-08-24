import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILD_STAGES,
  BLOCKED_REAL_EXECUTION_REQUIRED,
  CHARACTER_BUILDER_SCRIPT,
  CONTROL_SYSTEMS,
  DEPARTMENT_SCHEMA,
  GOAT_REAL_ASSET_EXECUTION_BLOCKED,
  GOAT_SYNTHETIC_TALKING_FIXTURE,
  NINE_SIXTEEN,
  PRODUCTION_VISEMES,
  VALIDATION_CLIPS,
  automaticWeightsAreFinal,
  buildBlenderCommand,
  buildCharacterRiggingConsoleModel,
  buildFuturePipCharacterManifestStub,
  buildGoatCharacterManifest,
  compileGoatDepartmentReports,
  compileGoatIdentityReport,
  compilePerformanceReport,
  compileRunPodDryRun,
  decideStageOutcome,
  diagnoseVertexWeights,
  evaluateBlenderCompatibility,
  evaluateGoatCharacterMasterGate,
  goatSyntheticTalkingPlan,
  inspectGoatSourcePackage,
  mapObjectNameToRole,
  planGoatCharacterExecution,
  planSpeechFromSyntheticTiming,
  resolveRepoRoot,
  runGoatCharacterBuildPipeline,
  simulationMandatory,
  visemeForPhoneme,
} from './tivvlejoy-character-rigging-department';

const repoRoot = resolveRepoRoot();

function readDept(rel: string) {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('TivvleJoy character rigging department', () => {
  it('uses the named department schema', () => {
    expect(DEPARTMENT_SCHEMA).toBe('TIVVLEJOY_CHARACTER_RIGGING_ANIMATION_DEPARTMENT_V1');
  });

  it('emits every build stage and stays fail-closed without Goat_FINN.zip', () => {
    const pipeline = runGoatCharacterBuildPipeline({ repoRoot });
    expect(pipeline.stages.map((item) => item.stage)).toEqual([...BUILD_STAGES]);
    expect(pipeline.stages).toHaveLength(26);
    expect(pipeline.gate.goatProductionReady).toBe(false);
    expect(pipeline.gate.status).toBe('BLOCKED');
    expect(pipeline.gate.verdict).toBe('NOT_PRODUCTION_READY');
    expect(pipeline.gate.blockers).toContain(GOAT_REAL_ASSET_EXECUTION_BLOCKED);
    const reused = runGoatCharacterBuildPipeline({ repoRoot, remoteHashLocked: true });
    expect(reused.stages.find((item) => item.stage === 'SOURCE_INTAKE')?.disposition).toBe('REUSED');
    expect(reused.stages.find((item) => item.stage === 'SOURCE_HASH_LOCK')?.disposition).toBe('REUSED');
    expect(reused.stages.find((item) => item.stage === 'CHARACTER_MASTER_GATE')?.disposition).toBe('BLOCKED');
    expect(reused.gate.goatProductionReady).toBe(false);
    expect(pipeline.gate.reports.goat_character_master_gate).toBe('BLOCKED');
    expect(Object.values(pipeline.gate.reports)).not.toContain('PASS');
  });

  it('is deterministic', () => {
    const first = runGoatCharacterBuildPipeline({ repoRoot });
    const second = runGoatCharacterBuildPipeline({ repoRoot });
    expect(first.pipelineHash).toBe(second.pipelineHash);
    expect(buildGoatCharacterManifest({ repoRoot }).manifestHash).toBe(
      buildGoatCharacterManifest({ repoRoot }).manifestHash,
    );
  });

  it('does not inspect a missing Goat package and does not substitute a placeholder', () => {
    const intake = inspectGoatSourcePackage(repoRoot);
    expect(intake.present).toBe(false);
    expect(intake.inspectionFaked).toBe(false);
    expect(intake.substitutedPlaceholder).toBe(false);
    expect(intake.status).toBe(BLOCKED_REAL_EXECUTION_REQUIRED);
    expect(intake.nextInputRequired).toContain('Goat_FINN.zip');
    expect(existsSync(path.join(repoRoot, 'production-library/characters/goat/SOURCE/Goat_FINN.zip'))).toBe(false);
  });

  it('requires a conversion copy for Blender 4.3 against the 4.2.2 pin', () => {
    const report = evaluateBlenderCompatibility('4.3');
    expect(report.status).toBe('CONVERSION_COPY_REQUIRED');
    expect(report.silentDowngradeForbidden).toBe(true);
    expect(report.sourceOverwriteForbidden).toBe(true);
    expect(report.studioPin.label).toBe('4.2.2');
  });

  it('blocks identity preservation without real inspection', () => {
    const report = compileGoatIdentityReport({ realInspectionAvailable: false });
    expect(report.claimsVisualPass).toBe(false);
    expect(report.state).toBe(BLOCKED_REAL_EXECUTION_REQUIRED);
    expect(report.checks.every((item) => item.state === BLOCKED_REAL_EXECUTION_REQUIRED)).toBe(true);
  });

  it('maps the production viseme set from synthetic timing only', () => {
    const plan = goatSyntheticTalkingPlan();
    expect(plan.elevenLabsContacted).toBe(false);
    expect(plan.pretendsAccurateLipSync).toBe(false);
    expect(plan.source).toBe('SYNTHETIC_FIXTURE');
    expect(PRODUCTION_VISEMES).toHaveLength(13);
    expect(visemeForPhoneme('AH')).toBe('AI');
    expect(visemeForPhoneme('M')).toBe('MBP');
    expect(visemeForPhoneme('SH')).toBe('CHSH');
    expect(planSpeechFromSyntheticTiming('CHAR_PIP_001', 'PIP.FUTURE', GOAT_SYNTHETIC_TALKING_FIXTURE).characterId).toBe(
      'CHAR_PIP_001',
    );
  });

  it('diagnoses weights and refuses automatic weights as final', () => {
    expect(automaticWeightsAreFinal()).toBe(false);
    const findings = diagnoseVertexWeights([
      { vertexIndex: 0, weights: [], side: 'L' },
      { vertexIndex: 1, weights: [{ group: 'DEF.THIGH.L', value: 0.4 }], side: 'L' },
      {
        vertexIndex: 2,
        side: 'L',
        weights: [
          { group: 'DEF.THIGH.R', value: 0.6 },
          { group: 'DEF.SHIN.L', value: 0.4 },
        ],
      },
      {
        vertexIndex: 3,
        weights: [
          { group: 'A', value: 0.3 },
          { group: 'B', value: 0.3 },
          { group: 'C', value: 0.2 },
          { group: 'D', value: 0.1 },
          { group: 'E', value: 0.1 },
        ],
      },
    ]);
    expect(findings.map((item) => item.code)).toEqual(
      expect.arrayContaining(['UNWEIGHTED_VERTEX', 'NON_NORMALIZED', 'WRONG_SIDE_CONTAMINATION', 'EXCESSIVE_INFLUENCES']),
    );
  });

  it('keeps IK/FK, face, secondary, and 9:16 validation plans generic enough for Pip later', () => {
    expect(CONTROL_SYSTEMS.find((item) => item.id === 'LEGS')?.features).toEqual(
      expect.arrayContaining(['ik', 'fk', 'ik_fk_switch', 'pole', 'foot_roll']),
    );
    expect(mapObjectNameToRole('Pip_Wing_L', 'CHAR_PIP_001')).toBe('WINGS');
    expect(mapObjectNameToRole('Goat_Collar', 'CHAR_GOAT_001')).toBe('COLLAR');
    expect(simulationMandatory()).toBe(false);
    expect(VALIDATION_CLIPS).toHaveLength(20);
    expect(NINE_SIXTEEN).toEqual(
      expect.objectContaining({ width: 1080, height: 1920, fps: 30 }),
    );
    expect(buildFuturePipCharacterManifestStub().rigNow).toBe(false);
  });

  it('never auto-passes the master gate, including forced human flags', () => {
    const forced = evaluateGoatCharacterMasterGate({
      repoRoot,
      humanApproved: true,
      deformationGatePassed: true,
      renderQaPassed: true,
      exportQaPassed: true,
    });
    expect(forced.goatProductionReady).toBe(false);
    expect(forced.status).toBe('BLOCKED');
    expect(forced.noFalsePass).toBe(true);
    expect(forced.forcedApprovalIgnored).toBe(true);
    expect(forced.safety.gpuLaunched).toBe(false);
    expect(forced.safety.paidCompute).toBe(false);
    expect(forced.safety.elevenLabsContacted).toBe(false);
    expect(forced.safety.productionMutated).toBe(false);
  });

  it('profiles performance as blocked until real Blender counters exist', () => {
    const report = compilePerformanceReport(null);
    expect(report.state).toBe(BLOCKED_REAL_EXECUTION_REQUIRED);
    expect(report.destructiveOptimizationForbiddenWithoutProfile).toBe(true);
  });

  it('builds a zero-cost RunPod/Blender dry-run command', () => {
    const dry = planGoatCharacterExecution();
    expect(dry.launched).toBe(false);
    expect(dry.paid).toBe(false);
    expect(dry.gpuLaunched).toBe(false);
    expect(dry.runpodContacted).toBe(false);
    expect(dry.payload.secureGpuPolicy).toBe('SECURE_GPU_PRESERVED');
    expect(dry.blenderCommand.argv).toEqual([
      'blender',
      '--background',
      'production-library/characters/goat/WORKING/CHAR_GOAT_001_working.blend',
      '--python',
      CHARACTER_BUILDER_SCRIPT,
      '--',
      '--manifest',
      'config/characters/CHAR_GOAT_001/manifest.json',
      '--dry-run',
    ]);
    const command = buildBlenderCommand({
      workingBlend: 'working.blend',
      manifestPath: 'manifest.json',
    });
    expect(command.gpuRequested).toBe(false);
    expect(compileRunPodDryRun({
      workingBlend: 'working.blend',
      manifestPath: 'manifest.json',
      artifactDir: '/tmp/char-dept',
    }).expectedArtifacts).toHaveLength(11);
  });

  it('explains idempotent dispositions', () => {
    expect(decideStageOutcome({ blocked: true, stageExists: false, inputHash: 'a', previousInputHash: null })).toBe(
      'BLOCKED',
    );
    expect(
      decideStageOutcome({ blocked: false, stageExists: true, inputHash: 'a', previousInputHash: 'a' }),
    ).toBe('REUSED');
    expect(
      decideStageOutcome({ blocked: false, stageExists: true, inputHash: 'b', previousInputHash: 'a' }),
    ).toBe('UPDATED');
    expect(
      decideStageOutcome({ blocked: false, stageExists: false, inputHash: 'a', previousInputHash: null }),
    ).toBe('CREATED');
  });

  it('emits the named Goat reports without a visual PASS', () => {
    const reports = compileGoatDepartmentReports({ repoRoot });
    expect(reports.goat_character_master_gate.status).toBe('BLOCKED');
    expect(reports.goat_topology_report.blindDecimateForbidden).toBe(true);
    expect(reports.goat_viseme_report.elevenLabsContacted).toBe(false);
  });

  it('exposes a truthful operator console model', () => {
    const model = buildCharacterRiggingConsoleModel();
    expect(model.goatProductionReady).toBe(false);
    expect(model.href).toBe('/character-rigging');
    expect(JSON.stringify(model)).not.toMatch(/DoodleDash/i);
  });

  it('runs the Python builder offline without bpy or GPU', () => {
    const artifactDir = mkdtempSync(path.join(tmpdir(), 'tj-char-dept-'));
    const stdout = execFileSync(
      'python3',
      [
        path.join(repoRoot, CHARACTER_BUILDER_SCRIPT),
        '--manifest',
        path.join(repoRoot, 'config/characters/CHAR_GOAT_001/manifest.json'),
        '--artifact-dir',
        artifactDir,
        '--dry-run',
      ],
      { encoding: 'utf8' },
    );
    expect(stdout).toContain('BLOCKED_REAL_EXECUTION_REQUIRED');
    expect(stdout).not.toContain('"goatProductionReady": true');
    expect(readdirSync(artifactDir)).toEqual(
      expect.arrayContaining([
        'goat_source_audit.json',
        'goat_character_master_gate.json',
        'goat_viseme_report.json',
      ]),
    );
    const gate = JSON.parse(readFileSync(path.join(artifactDir, 'goat_character_master_gate.json'), 'utf8')) as {
      goatProductionReady: boolean;
      status: string;
    };
    expect(gate.goatProductionReady).toBe(false);
    expect(gate.status).toBe('BLOCKED');
  });

  it('keeps character Python modules free of shell, network, and source-overwrite tokens', () => {
    const dir = path.join(repoRoot, 'scripts/blender/characters');
    const files = readdirSync(dir, { recursive: true }).filter((item) => String(item).endsWith('.py'));
    const joined = files.map((item) => readFileSync(path.join(dir, String(item)), 'utf8')).join('\n');
    expect(joined).not.toMatch(/\bsubprocess\b/);
    expect(joined).not.toMatch(/os\.system|os\.popen/);
    expect(joined).not.toMatch(/\brequests\b|\bsocket\b|urllib/);
    const planning = files.filter(
      (item) =>
        !String(item).endsWith('execute.py') && !String(item).endsWith('create_synthetic_goat_fixture.py'),
    );
    const planningJoined = planning.map((item) => readFileSync(path.join(dir, String(item)), 'utf8')).join('\n');
    expect(planningJoined).not.toMatch(/save_as_mainfile|overwrite source/i);
    expect(joined).toMatch(/save_as_mainfile/);
    expect(joined).toMatch(/LOCKED_SOURCE_WRITE_FORBIDDEN|_refuse_locked_write/);
    expect(joined).not.toMatch(/overwrite source/i);
    expect(joined).not.toMatch(/sk_live_|RUNPOD_API/i);
    expect(joined).toMatch(/elevenLabsContacted.: False/);
    expect(joined).not.toMatch(/DoodleDash/i);
  });

  it('does not claim the existing placeholder goat blends are Goat_FINN', () => {
    const source = readDept('apps/web/src/lib/tivvlejoy-character-rigging-department/source-intake.ts');
    expect(source).not.toContain('goat_v1.blend');
    expect(source).not.toContain('goat_production.blend');
    expect(readFileSync(path.join(repoRoot, 'config/characters/CHAR_GOAT_001/manifest.json'), 'utf8')).toContain(
      'Goat_FINN.zip',
    );
  });
});

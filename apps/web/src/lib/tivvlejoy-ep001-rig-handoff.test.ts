import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileEp001ProductionPackage } from './tivvlejoy-ep001-production-package';
import {
  EP001_RIG_HANDOFF_MATRIX_SCHEMA,
  compileEp001RigHandoffMatrix,
} from './tivvlejoy-ep001-rig-handoff';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_RIG_HANDOFF_MATRIX_V1', () => {
  it('compiles deterministically and binds to the exact Episode 1 package', () => {
    const episode = compileEp001ProductionPackage();
    const first = compileEp001RigHandoffMatrix(episode);
    const second = compileEp001RigHandoffMatrix(episode);

    expect(first.schemaVersion).toBe(EP001_RIG_HANDOFF_MATRIX_SCHEMA);
    expect(first.episodeId).toBe('EP001');
    expect(first.productionPackageSha256).toBe(episode.packageSha256);
    expect(first.matrixSha256).toBe(second.matrixSha256);
    expect(first.matrixSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('covers every intended Pip and Goat action and binds each action to its shots', () => {
    const episode = compileEp001ProductionPackage();
    const matrix = compileEp001RigHandoffMatrix(episode);

    for (const character of matrix.characters) {
      const expectedActions = [
        ...new Set(
          episode.shots.flatMap(
            (shot) => shot.performance[character.characterId]?.intendedActions ?? [],
          ),
        ),
      ];
      expect(character.actionCoverage.map((action) => action.actionId)).toEqual(expectedActions);

      for (const action of character.actionCoverage) {
        const expectedShots = episode.shots
          .filter((shot) =>
            shot.performance[character.characterId]?.intendedActions.includes(action.actionId),
          )
          .map((shot) => shot.shotId);
        expect(action.shotIds).toEqual(expectedShots);
        expect(action.requiredCapabilityFamilies.length).toBeGreaterThan(0);
        expect(action.acceptanceEvidence.length).toBeGreaterThan(20);
      }
    }
  });

  it('makes the episode-critical deformation and interaction controls explicit', () => {
    const matrix = compileEp001RigHandoffMatrix();
    const pip = matrix.characters.find((character) => character.characterId === 'PIP')!;
    const goat = matrix.characters.find((character) => character.characterId === 'GOAT')!;

    expect(pip.admissionRequiredControls).toHaveLength(25);
    expect(pip.episodeRequiredControls.map((control) => control.controlId)).toEqual(
      expect.arrayContaining([
        'PIP.WING_LEFT',
        'PIP.WING_RIGHT',
        'PIP.TOES',
        'PIP.PROP_HAND',
        'PIP.BEAK_UPPER',
        'PIP.BEAK_LOWER',
      ]),
    );
    expect(pip.preferredEpisodeControls.map((control) => control.controlId)).toEqual([
      'PIP.HALLUX',
    ]);
    expect(pip.requiredTestPoses).toEqual(
      expect.arrayContaining(['wing raised', 'map carry', 'backpack continuity']),
    );

    expect(goat.admissionRequiredControls).toHaveLength(18);
    expect(goat.episodeRequiredControls.map((control) => control.controlId)).toEqual(
      expect.arrayContaining([
        'GOAT.HEAD',
        'GOAT.NECK',
        'GOAT.JAW',
        'GOAT.HOOF_LEFT',
        'GOAT.HOOF_RIGHT',
      ]),
    );
    expect(goat.preferredEpisodeControls.map((control) => control.controlId)).toEqual([
      'GOAT.EAR_LEFT',
      'GOAT.EAR_RIGHT',
    ]);
    expect(
      goat.actionCoverage.find((action) => action.actionId === 'GOAT_EAR_REACTION')
        ?.supportExpectation,
    ).toBe('REQUIRED_WITH_ALLOWED_FALLBACK');
    expect(goat.requiredTestPoses).toContain('collar/tag stability');
  });

  it('requires one canonical source per character without inventing duplicate deliverables', () => {
    const matrix = compileEp001RigHandoffMatrix();
    for (const character of matrix.characters) {
      expect(character.sourceFiles.filter((file) => file.required)).toHaveLength(1);
      expect(character.sourceFiles.find((file) => file.required)?.label).toContain(
        'Blender source',
      );
      expect(character.sourceFiles.find((file) => file.label.endsWith('FBX'))?.required).toBe(
        false,
      );
      expect(character.sourceFiles.find((file) => file.label.endsWith('GLB'))?.required).toBe(
        false,
      );
      expect(character.rigReceived).toBe(false);
      expect(character.humanVisualApprovalIssued).toBe(false);
    }
  });

  it('keeps all admission and execution authority fail-closed', () => {
    const matrix = compileEp001RigHandoffMatrix();
    expect(matrix.state).toBe('WAITING_FOR_PIP_AND_GOAT_RIGS');
    expect(matrix.acceptanceChecklist).toHaveLength(18);
    expect(matrix.acceptanceChecklist.every((row) => !row.complete && !row.autoApproval)).toBe(
      true,
    );
    expect(matrix.authority).toEqual({
      rigAdmissionGranted: false,
      humanVisualApprovalIssued: false,
      characterAnimationExecutionAllowed: false,
      paidComputeAllowed: false,
      productionWritesAllowed: false,
      autoApprovalAllowed: false,
    });
    expect(matrix.safety).toEqual({
      semanticRequirementsOnly: true,
      rigBytesIncluded: false,
      networkCalls: 0,
      storageMutations: 0,
    });
  });

  it('renders the handoff in Studio without adding a client mutation path', () => {
    const page = readRepo('apps/web/src/app/episode-one/page.tsx');
    const component = readRepo('apps/web/src/components/preview/Ep001RigHandoffMatrix.tsx');

    expect(page).toContain('compileEp001RigHandoffMatrix(episode)');
    expect(page).toContain("['#rig-handoff', 'Rig handoff']");
    expect(page).toContain('<Ep001RigHandoffMatrix matrix={rigHandoff} />');
    expect(component).toContain('Exactly what Michael needs to deliver');
    expect(component).toContain('Shot-by-shot action coverage');
    expect(component).toContain('Open rig arrival');
    expect(component).not.toContain("'use client'");
    expect(component).not.toContain("'use server'");
    expect(component).not.toContain('fetch(');
    expect(component).not.toContain('onClick=');
    expect(component).not.toContain('<form');
  });
});

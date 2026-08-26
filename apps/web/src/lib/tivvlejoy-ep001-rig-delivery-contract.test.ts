import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_RIG_DELIVERY_CONTRACT_SCHEMA,
  compileEp001RigDeliveryContract,
} from './tivvlejoy-ep001-rig-delivery-contract';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_RIG_DELIVERY_CONTRACT_V1', () => {
  it('compiles deterministically and binds to the exact rig handoff matrix', () => {
    const first = compileEp001RigDeliveryContract();
    const second = compileEp001RigDeliveryContract();

    expect(first.schemaVersion).toBe(EP001_RIG_DELIVERY_CONTRACT_SCHEMA);
    expect(first.episodeId).toBe('EP001');
    expect(first.contractSha256).toBe(second.contractSha256);
    expect(first.contractSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.rigMatrixSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves the exact extension-specific intake ceilings', () => {
    const contract = compileEp001RigDeliveryContract();
    expect(contract.intakePolicy.minimumBytes).toBe(1024);
    expect(contract.intakePolicy.extensionLimits).toEqual([
      { extension: '.blend', maxBytes: 384 * 1024 * 1024, maxMiB: 384, canonical: true },
      { extension: '.glb', maxBytes: 256 * 1024 * 1024, maxMiB: 256, canonical: false },
      { extension: '.fbx', maxBytes: 256 * 1024 * 1024, maxMiB: 256, canonical: false },
    ]);
    expect(contract.intakePolicy.filenameIsIdentity).toBe(false);
    expect(contract.intakePolicy.sha256IsIdentity).toBe(true);
    expect(contract.intakePolicy.priorVersionOverwriteAllowed).toBe(false);
  });

  it('requires the full Pip and Goat delivery evidence without inventing approval', () => {
    const contract = compileEp001RigDeliveryContract();
    const pip = contract.characters.find((character) => character.characterId === 'PIP')!;
    const goat = contract.characters.find((character) => character.characterId === 'GOAT')!;

    expect(pip.requiredControlCount).toBe(25);
    expect(pip.requiredTestPoseCount).toBe(13);
    expect(pip.requiredTestPoses).toContain('backpack continuity');
    expect(pip.requiredControls.map((control) => control.controlId)).toContain('PIP.TOES');
    expect(pip.preferredEpisodeControls.map((control) => control.controlId)).toEqual([
      'PIP.HALLUX',
    ]);

    expect(goat.requiredControlCount).toBe(18);
    expect(goat.requiredTestPoseCount).toBe(11);
    expect(goat.requiredTestPoses).toContain('collar/tag stability');
    expect(goat.preferredEpisodeControls.map((control) => control.controlId)).toEqual([
      'GOAT.EAR_LEFT',
      'GOAT.EAR_RIGHT',
    ]);

    for (const character of contract.characters) {
      expect(character.canonicalSource.requiredExtension).toBe('.blend');
      expect(character.canonicalSource.oneCanonicalSourceRequired).toBe(true);
      expect(character.canonicalSource.sha256BecomesImmutableIdentity).toBe(true);
      expect(character.requiredEvidence).toContain('Human visual approval receipt after inspection');
    }
  });

  it('keeps every execution and approval authority fail-closed', () => {
    const contract = compileEp001RigDeliveryContract();
    expect(contract.state).toBe('DELIVERY_CONTRACT_READY_RIGS_NOT_ADMITTED');
    expect(contract.authority).toEqual({
      rigAdmissionGranted: false,
      humanVisualApprovalIssued: false,
      animationExecutionAllowed: false,
      paidComputeAllowed: false,
      productionWritesAllowed: false,
      autoApprovalAllowed: false,
    });
    expect(contract.safety).toEqual({
      sourceBytesIncluded: false,
      networkCalls: 0,
      storageMutations: 0,
      paidRequests: 0,
    });
  });

  it('renders as a read-only Studio route', () => {
    const page = readRepo('apps/web/src/app/episode-one/rig-delivery/page.tsx');
    expect(page).toContain('Artist rig delivery contract');
    expect(page).toContain('compileEp001RigDeliveryContract()');
    expect(page).toContain('Canonical Blender source');
    expect(page).toContain('Required test poses');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTION_IDS,
  CAPABILITY_FAMILIES,
  PIP_CAPABILITY_PROFILE,
  PIP_REQUIRED_CONTROLS,
  GOAT_CAPABILITY_PROFILE,
  GOAT_REQUIRED_CONTROLS,
  allCapabilityFamilies,
  buildRigContract,
  capability,
  missingRequiredFamilies,
  requiredFamilies,
  syntheticGoatContract,
  syntheticPipContract,
  SYNTHETIC_BANNER,
} from './tivvlejoy-character-animation';

describe('character rig contract', () => {
  it('declares every required capability family', () => {
    expect(CAPABILITY_FAMILIES).toEqual(expect.arrayContaining([
      'ROOT_MOTION', 'BODY_CENTER', 'CHEST', 'NECK', 'HEAD',
      'EYE_LEFT', 'EYE_RIGHT', 'EYE_AIM', 'EYELID_LEFT', 'EYELID_RIGHT',
      'MOUTH_OR_BEAK_UPPER', 'MOUTH_OR_BEAK_LOWER', 'FACE_EXPRESSION',
      'ARM_OR_WING_LEFT', 'ARM_OR_WING_RIGHT', 'LEG_LEFT', 'LEG_RIGHT',
      'FOOT_LEFT', 'FOOT_RIGHT', 'TOE_OR_DIGIT_CONTROLS',
      'ACCESSORY_CONTROLS', 'PROP_ATTACHMENT_POINTS',
    ]));
    expect(allCapabilityFamilies()).toHaveLength(22);
  });

  it('builds a filename-free identity', () => {
    const contract = syntheticPipContract();
    expect(contract.rigId).not.toMatch(/\.blend$/);
    expect(contract.characterId).toBe('PIP');
    expect(contract.contractSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for identical identity and capabilities', () => {
    expect(syntheticPipContract().contractSha256).toBe(syntheticPipContract().contractSha256);
  });

  it('changes hash when the rig version changes', () => {
    expect(syntheticPipContract('SYNTHETIC_V1').contractSha256).not.toBe(syntheticPipContract('SYNTHETIC_V2').contractSha256);
  });

  it('does not use seller bone names as identity', () => {
    expect(JSON.stringify(syntheticPipContract())).not.toMatch(/DEF_thigh|mixamorig|ctrl_master/i);
  });

  it('lists required families from a profile', () => {
    expect(requiredFamilies(PIP_CAPABILITY_PROFILE)).toContain('HEAD');
    expect(requiredFamilies(GOAT_CAPABILITY_PROFILE)).toContain('ROOT_MOTION');
  });

  it('detects missing required families', () => {
    expect(missingRequiredFamilies(PIP_CAPABILITY_PROFILE, [capability('HEAD', 'X', 'REQUIRED', 'only head')])).toContain('NECK');
  });

  it('keeps optional crest separate from required beak', () => {
    const crest = PIP_CAPABILITY_PROFILE.find((item) => item.controlId === 'PIP.CREST');
    const beak = PIP_CAPABILITY_PROFILE.find((item) => item.controlId === 'PIP.BEAK_UPPER');
    expect(crest?.requirement).toBe('OPTIONAL');
    expect(beak?.requirement).toBe('REQUIRED');
    expect(beak?.semanticPurpose).toContain('BEAK_OPEN');
  });

  it('requires Pip scarf backpack straps and copper spiral', () => {
    expect(PIP_REQUIRED_CONTROLS).toEqual(expect.arrayContaining(['PIP.SCARF', 'PIP.BACKPACK', 'PIP.STRAP_LEFT', 'PIP.STRAP_RIGHT', 'PIP.COPPER_SPIRAL']));
  });

  it('marks Pip hallux as desirable not required', () => {
    expect(PIP_CAPABILITY_PROFILE.find((item) => item.controlId === 'PIP.HALLUX')?.requirement).toBe('DESIRABLE');
  });

  it('requires Goat collar and tag without inventing freelancer bones', () => {
    expect(GOAT_REQUIRED_CONTROLS).toEqual(expect.arrayContaining(['GOAT.COLLAR', 'GOAT.TAG', 'GOAT.JAW']));
    expect(JSON.stringify(GOAT_CAPABILITY_PROFILE)).not.toMatch(/seller|fiverr|upwork/i);
  });

  it('treats Goat eyelids and sit as non-required', () => {
    expect(GOAT_CAPABILITY_PROFILE.find((item) => item.controlId === 'GOAT.EYELID_LEFT')?.requirement).toBe('DESIRABLE');
    expect(GOAT_CAPABILITY_PROFILE.find((item) => item.controlId === 'GOAT.SIT')?.requirement).toBe('OPTIONAL');
  });

  for (const family of CAPABILITY_FAMILIES.filter((item) => item !== 'FACE_EXPRESSION')) {
    it(`includes ${family} in the Pip or Goat planning profile when relevant`, () => {
      const combined = [...PIP_CAPABILITY_PROFILE, ...GOAT_CAPABILITY_PROFILE].map((item) => item.family);
      expect(combined.includes(family) || family === 'ARM_OR_WING_LEFT' || family === 'ARM_OR_WING_RIGHT').toBe(true);
    });
  }

  it('exposes a 42-action semantic vocabulary', () => {
    expect(ACTION_IDS).toHaveLength(42);
    expect(ACTION_IDS).toContain('PIP_WING_FLUTTER');
    expect(ACTION_IDS).toContain('GOAT_HEAD_BOB');
  });

  it('keeps synthetic contracts marked synthetic', () => {
    expect(syntheticPipContract().evidenceClass).toBe('SYNTHETIC_PREVIEW');
    expect(syntheticGoatContract().evidenceClass).toBe('SYNTHETIC_PREVIEW');
    expect(SYNTHETIC_BANNER).toContain('NOT HUMAN APPROVED');
  });

  it('does not mutate production-library character files from contract modules', () => {
    const dir = path.resolve(__dirname, './tivvlejoy-character-animation');
    const sources = readdirSync(dir).filter((name) => name.endsWith('.ts')).map((name) => readFileSync(path.join(dir, name), 'utf8')).join('\n');
    expect(sources).not.toMatch(/writeFileSync|production-library\/characters/);
    expect(sources).not.toMatch(/child_process|blender -b|bpy\./);
  });
});

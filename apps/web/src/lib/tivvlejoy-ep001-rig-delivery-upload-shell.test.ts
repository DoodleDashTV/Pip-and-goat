import { describe, expect, it } from 'vitest';
import { compileEp001RigDeliveryUploadShell, EP001_RIG_DELIVERY_UPLOAD_SHELL_SCHEMA } from './tivvlejoy-ep001-rig-delivery-upload-shell';

describe('EP001 rig delivery upload shell', () => {
  it('prepares exactly two empty rig delivery slots', () => {
    const shell = compileEp001RigDeliveryUploadShell();
    expect(shell.schemaVersion).toBe(EP001_RIG_DELIVERY_UPLOAD_SHELL_SCHEMA);
    expect(shell.slots).toHaveLength(2);
    expect(shell.slots.map((slot) => slot.characterId).sort()).toEqual(['CHAR_GOAT_001','CHAR_PIP_001']);
    expect(shell.slots.every((slot) => slot.uploadState === 'EMPTY')).toBe(true);
    expect(shell.slots.every((slot) => slot.episodeAdmissionState === 'BLOCKED')).toBe(true);
    expect(shell.rigDeliveryUploadShellSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reuses the existing character source intake and never treats upload as approval', () => {
    const shell = compileEp001RigDeliveryUploadShell();
    expect(shell.slots.every((slot) => slot.intakeSurface === '/api/character-source-intake')).toBe(true);
    expect(shell.authority.anyRigUploaded).toBe(false);
    expect(shell.authority.anyRigApproved).toBe(false);
    expect(shell.authority.anyRigAdmitted).toBe(false);
    expect(shell.authority.paidExecutionAuthorized).toBe(false);
    expect(shell.safety.blenderLaunched).toBe(false);
    expect(shell.safety.paidRequests).toBe(0);
  });
});

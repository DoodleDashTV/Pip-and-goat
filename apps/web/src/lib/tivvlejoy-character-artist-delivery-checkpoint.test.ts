import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_ARTIST_DELIVERY_CHECKPOINT_SCHEMA,
  compileCharacterArtistDeliveryCheckpoint,
} from './tivvlejoy-character-artist-delivery-checkpoint';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_CHARACTER_ARTIST_DELIVERY_CHECKPOINT_V1', () => {
  it('compiles deterministically and binds to the production gateway', () => {
    const first = compileCharacterArtistDeliveryCheckpoint();
    const second = compileCharacterArtistDeliveryCheckpoint();
    expect(first.schemaVersion).toBe(CHARACTER_ARTIST_DELIVERY_CHECKPOINT_SCHEMA);
    expect(first.checkpointSha256).toBe(second.checkpointSha256);
    expect(first.checkpointSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.episodeGatewaySha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps Goat first and Bird second without claiming receipt or approval', () => {
    const checkpoint = compileCharacterArtistDeliveryCheckpoint();
    expect(checkpoint.deliveries).toHaveLength(2);
    expect(checkpoint.deliveries[0]).toMatchObject({ sequence: 1, characterId: 'GOAT', displayName: 'Goat', inspectionState: 'NOT_RECEIVED_NOT_REVIEWED', humanApproved: false, productionReady: false });
    expect(checkpoint.deliveries[1]).toMatchObject({ sequence: 2, characterId: 'PIP', displayName: 'Bird', workOrderState: 'WAITING_FOR_GOAT_COMPLETION', inspectionState: 'NOT_RECEIVED_NOT_REVIEWED', humanApproved: false, productionReady: false });
    expect(checkpoint.deliveries.every((item) => item.deliveryReceipt.canonicalBlendSha256 === null && item.deliveryReceipt.canonicalBlendByteSize === null)).toBe(true);
  });

  it('records commercial planning separately from production approval', () => {
    const checkpoint = compileCharacterArtistDeliveryCheckpoint();
    const goat = checkpoint.deliveries[0];
    expect(goat.commercialTerms.platformLabel).toBe('Fiverr');
    expect(goat.commercialTerms.quotedUsd).toBe(250);
    expect(goat.commercialTerms.orderAccepted).toBe(false);
    expect(goat.commercialTerms.paymentRecordedAsProductionApproval).toBe(false);
    expect(checkpoint.authority.paymentAllowed).toBe(false);
    expect(checkpoint.authority.deliveryAcceptanceAllowed).toBe(false);
    expect(checkpoint.authority.rigAdmissionAllowed).toBe(false);
    expect(checkpoint.authority.animationExecutionAllowed).toBe(false);
  });

  it('keeps the Studio handoff route read-only', () => {
    const page = readRepo('apps/web/src/app/character-artist-handoff/page.tsx');
    expect(page).toContain('Character artist handoff');
    expect(page).toContain('compileCharacterArtistDeliveryCheckpoint()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});

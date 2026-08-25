import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GOAT_CHARACTER_ID,
  GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6,
  GOAT_SOURCE_OBJECT_KEY,
  GOAT_SOURCE_SHA256,
  GOAT_SOURCE_SIZE_BYTES,
  GOAT_V6_EXECUTION_ID,
  GOAT_V6_HARD_COST_USD,
  GOAT_V6_PLANNED_POD_NAME,
  GOAT_V6_REQUIRED_DIGEST,
  GOAT_V6_REQUIRED_RENDER_ASSET_SHA256,
  GOAT_V6_REQUIRED_RENDER_CODE_SHA256,
  GOAT_V6_REQUIRED_SOURCE_COMMIT,
  GoatV6PaidMutationTripwire,
  consumeGoatV6Authorization,
  createGoatV6AuthorizationReceipt,
  evaluateGoatV6PaidExecutionAuthorization,
  readGoatV6ConsumptionLedger,
} from './index';

function makePinnedRepo(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'goat-v6-pin-'));
  const config = path.join(root, 'config/cloud');
  mkdirSync(config, { recursive: true });
  const ref = `ghcr.io/doodledashtv/ddp-runpod-blender@${GOAT_V6_REQUIRED_DIGEST}`;
  writeFileSync(
    path.join(config, 'character-worker-image.json'),
    `${JSON.stringify({
      schema: 'TIVVLEJOY_GOAT_CHARACTER_WORKER_IMAGE_PIN_V1',
      repository: 'ddp-runpod-blender',
      digest: GOAT_V6_REQUIRED_DIGEST,
      ref,
      sourceCommit: GOAT_V6_REQUIRED_SOURCE_COMMIT,
      architecture: 'linux/amd64',
      blenderVersion: '4.2.2',
      characterMasterCapable: true,
      goatMaterializerBaked: true,
      characterDepartmentBaked: true,
      stageCount: 26,
      jobKinds: ['CHARACTER_MASTER_BUILD', 'CHARACTER_SOURCE_MATERIALIZE', 'CHARACTER_BUILD'],
    })}\n`,
  );
  writeFileSync(
    path.join(config, 'character-worker-image.pin.ts'),
    `export const CHARACTER_WORKER_IMAGE = '${ref}';\n`,
  );
  return root;
}

describe('Goat paid execution V6', () => {
  it('binds the receipt to one immutable image, one source, one SECURE 4090, and the $3 ceiling', () => {
    const receipt = createGoatV6AuthorizationReceipt({
      issuedAt: '2026-08-24T22:30:00.000Z',
      expiresAt: '2026-08-25T22:30:00.000Z',
    });
    expect(receipt).toMatchObject({
      authorizationName: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6,
      consumed: false,
      executionId: GOAT_V6_EXECUTION_ID,
      characterId: GOAT_CHARACTER_ID,
      sourceKey: GOAT_SOURCE_OBJECT_KEY,
      expectedSha256: GOAT_SOURCE_SHA256,
      expectedSizeBytes: GOAT_SOURCE_SIZE_BYTES,
      authorizedImageDigest: GOAT_V6_REQUIRED_DIGEST,
      authorizedImageSourceCommit: GOAT_V6_REQUIRED_SOURCE_COMMIT,
      liveDepartmentUsesBlenderRuntime: true,
      cloudType: 'SECURE',
      gpuTypeId: 'NVIDIA GeForce RTX 4090',
      maxCreateRequests: 1,
      maxPods: 1,
      maxRuntimeMinutes: 180,
      hardCostUsd: GOAT_V6_HARD_COST_USD,
      noRetry: true,
      productionPromotionForbidden: true,
      humanVisualApprovalRequired: true,
    });
  });

  it('authorizes only when the image, source, receipt, price, Pod count, and durable output proof all match', () => {
    const repoRoot = makePinnedRepo();
    const receipt = createGoatV6AuthorizationReceipt({
      issuedAt: '2026-08-24T22:30:00.000Z',
      expiresAt: '2026-08-25T22:30:00.000Z',
    });
    const live = {
      receipt,
      sourceLocked: true,
      objectExists: true,
      storedSize: GOAT_SOURCE_SIZE_BYTES,
      storedSha256: GOAT_SOURCE_SHA256,
      hashVerified: true,
      zipOk: true,
      incompleteMultipartCount: 0,
      registryOk: true,
      registryDigest: GOAT_V6_REQUIRED_DIGEST,
      registrySourceCommit: GOAT_V6_REQUIRED_SOURCE_COMMIT,
      registryRenderCodeSha256: GOAT_V6_REQUIRED_RENDER_CODE_SHA256,
      registryRenderAssetSha256: GOAT_V6_REQUIRED_RENDER_ASSET_SHA256,
      registryCapabilitySchema: 'TIVVLEJOY_CHARACTER_WORKER_CAPABILITY_V2',
      registryEntrypoint: 'TIVVLEJOY_CHARACTER_MASTER_DISPATCH_V6',
      registryRequiredAuthorization: GOAT_LIVE_PAID_EXECUTION_AUTHORIZATION_V6,
      registryBlenderVersion: '4.2.2',
      registryStageCount: '26',
      liveDepartmentUsesBlenderRuntime: true,
      liveCharacterDepartmentCapable: true,
      authorizedRealSourceDownloadCapable: true,
      durableArtifactPersistenceCapable: true,
      requiresPaidAuthorization: true,
      sourceWritesForbidden: true,
      mandatoryDryRun: false,
      secure4090PriceUsdPerHr: 0.74,
      secure4090StockStatus: 'High',
      existingBillablePodCount: 0,
      exactPlannedNamePodCount: 0,
      evidenceKeysAlreadyExist: false,
    };
    const allowed = evaluateGoatV6PaidExecutionAuthorization({
      repoRoot,
      live,
      nowMs: Date.parse('2026-08-24T23:00:00.000Z'),
    });
    expect(allowed.status).toBe('LAUNCH_AUTHORIZED');
    expect(allowed.launchAllowed).toBe(true);
    expect(allowed.remainingBlockers).toEqual([]);
    expect(allowed.quote.predicted180MinUsd).toBe(2.22);
    expect(allowed.goatProductionReady).toBe(false);

    const wrongDigest = evaluateGoatV6PaidExecutionAuthorization({
      repoRoot,
      live: { ...live, registryDigest: `sha256:${'f'.repeat(64)}` },
      nowMs: Date.parse('2026-08-24T23:00:00.000Z'),
    });
    expect(wrongDigest.launchAllowed).toBe(false);
    expect(wrongDigest.remainingBlockers).toContain('V6_IMAGE_PROVENANCE_MISMATCH');

    const missingAssetLabel = evaluateGoatV6PaidExecutionAuthorization({
      repoRoot,
      live: { ...live, registryRenderAssetSha256: null },
      nowMs: Date.parse('2026-08-24T23:00:00.000Z'),
    });
    expect(missingAssetLabel.launchAllowed).toBe(false);
    expect(missingAssetLabel.remainingBlockers).toContain('V6_IMAGE_PROVENANCE_MISMATCH');

    const missingBlenderRuntimeLabel = evaluateGoatV6PaidExecutionAuthorization({
      repoRoot,
      live: { ...live, liveDepartmentUsesBlenderRuntime: false },
      nowMs: Date.parse('2026-08-24T23:00:00.000Z'),
    });
    expect(missingBlenderRuntimeLabel.launchAllowed).toBe(false);
    expect(missingBlenderRuntimeLabel.remainingBlockers).toContain('LIVE_BLENDER_RUNTIME_PROOF_MISSING');

    const supersededV4 = evaluateGoatV6PaidExecutionAuthorization({
      repoRoot,
      live: {
        ...live,
        receipt: {
          ...receipt,
          authorizationName: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V4',
        } as unknown as typeof receipt,
      },
      nowMs: Date.parse('2026-08-24T23:00:00.000Z'),
    });
    expect(supersededV4.launchAllowed).toBe(false);
    expect(supersededV4.remainingBlockers).toContain('INVALID_SUPERSEDED_AUTHORIZATION');

    const supersededV5 = evaluateGoatV6PaidExecutionAuthorization({
      repoRoot,
      live: {
        ...live,
        receipt: {
          ...receipt,
          authorizationName: 'TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V5',
        } as unknown as typeof receipt,
      },
      nowMs: Date.parse('2026-08-24T23:00:00.000Z'),
    });
    expect(supersededV5.launchAllowed).toBe(false);
    expect(supersededV5.remainingBlockers).toContain('INVALID_SUPERSEDED_AUTHORIZATION');

    const expired = evaluateGoatV6PaidExecutionAuthorization({
      repoRoot,
      live,
      nowMs: Date.parse('2026-08-26T00:00:00.000Z'),
    });
    expect(expired.remainingBlockers).toContain('V6_AUTHORIZATION_EXPIRED');
  });

  it('consumes the V6 ledger atomically and permanently forbids a second CREATE', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'goat-v6-ledger-'));
    expect(readGoatV6ConsumptionLedger(root)).toBeNull();
    const first = consumeGoatV6Authorization(root, new Date('2026-08-24T23:00:00.000Z'));
    expect(first.ok).toBe(true);
    expect(readGoatV6ConsumptionLedger(root)).toMatchObject({
      consumed: true,
      createAttempted: true,
      createRequestOrdinal: 1,
      plannedPodName: GOAT_V6_PLANNED_POD_NAME,
    });
    const second = consumeGoatV6Authorization(root, new Date('2026-08-24T23:01:00.000Z'));
    expect(second.ok).toBe(false);

    const tripwire = new GoatV6PaidMutationTripwire();
    expect(() =>
      tripwire.authorizeSingleCreate({ launchAllowed: false, ledgerConsumed: true, existingPodCount: 0 }),
    ).toThrow('CREATE_REFUSED_PREFLIGHT');
    expect(() =>
      tripwire.authorizeSingleCreate({ launchAllowed: true, ledgerConsumed: false, existingPodCount: 0 }),
    ).toThrow('CREATE_REFUSED_UNCONSUMED');
    expect(() =>
      tripwire.authorizeSingleCreate({ launchAllowed: true, ledgerConsumed: true, existingPodCount: 1 }),
    ).toThrow('CREATE_REFUSED_POD_ALREADY_PRESENT');
    tripwire.authorizeSingleCreate({ launchAllowed: true, ledgerConsumed: true, existingPodCount: 0 });
    expect(tripwire.createRequestCount).toBe(1);
    expect(() =>
      tripwire.authorizeSingleCreate({ launchAllowed: true, ledgerConsumed: true, existingPodCount: 0 }),
    ).toThrow('CREATE_RETRY_FORBIDDEN');
  });

  it('keeps preflight read-only and gives the launcher one CREATE plus mandatory teardown', () => {
    const preflight = readFileSync(
      path.resolve(__dirname, '../../../../../scripts/cloud/goat-paid-execution-v6/preflight.ts'),
      'utf8',
    );
    const launch = readFileSync(
      path.resolve(__dirname, '../../../../../scripts/cloud/goat-paid-execution-v6/launch.ts'),
      'utf8',
    );
    expect(preflight).toContain('never creates a Pod');
    expect(preflight).toContain('Range:');
    expect(preflight).toContain("ddp.character.live.blender.runtime");
    expect(preflight).not.toMatch(/ALLOW_PAID_GPU_LAUNCH\s*=\s*['"]true['"]/);
    expect(preflight).not.toMatch(/createPodForBenchmark\([\s\S]*ALLOW_PAID_GPU_LAUNCH:\s*['"]true['"]/);
    expect(launch.match(/createPodForBenchmark\(/g)).toHaveLength(1);
    expect(launch).toContain("IfNoneMatch: '*'");
    expect(launch).toContain('never retried');
    expect(launch).toContain('finally');
    expect(launch).toContain('terminatePod');
    expect(launch).toContain('AUTHORIZED_DOWNLOAD_COUNT');
    expect(launch).toContain('LIVE_DEPARTMENT_PROOF');
    expect(launch).toContain("executionRuntime !== 'BLENDER_BPY'");
    expect(launch).toContain('OUTPUT_CONTRACT_FAILED');
    expect(launch).toContain("process.env.ALLOW_PAID_GPU_LAUNCH = 'false'");
  });
});

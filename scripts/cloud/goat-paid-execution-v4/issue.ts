#!/usr/bin/env tsx
/** Issue the exact digest-bound V4 receipt. Creates no Pod and performs no download. */
import {
  GOAT_V4_REQUIRED_DIGEST,
  createGoatV4AuthorizationReceipt,
} from '../../../apps/web/src/lib/tivvlejoy-character-source-intake/goat-v4-authorization';
import { AUTHORIZATION_FILE, ensureOutputDir, writeJson } from './common';

function main(): void {
  if (/^sha256:0{64}$/.test(GOAT_V4_REQUIRED_DIGEST)) {
    throw new Error('V4_IMAGE_DIGEST_NOT_PINNED');
  }
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000);
  const receipt = createGoatV4AuthorizationReceipt({
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  ensureOutputDir();
  writeJson(AUTHORIZATION_FILE, receipt);
  console.log(
    JSON.stringify({
      ok: true,
      authorizationName: receipt.authorizationName,
      executionId: receipt.executionId,
      digest: receipt.authorizedImageDigest,
      issuedAt: receipt.issuedAt,
      expiresAt: receipt.expiresAt,
      consumed: false,
      createsPod: false,
      downloadsSource: false,
    }),
  );
}

main();

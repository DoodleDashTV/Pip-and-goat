import { describe, expect, it } from 'vitest';
import {
  GAP_LEDGER_SCHEMA,
  bindEp012VoiceReceipts,
  compileFirstEpisodePreflight,
  compileGapLedger,
  firstEpisodeCriticalPath,
  morningBrief,
  nextSafeActions,
  prioritizeGaps,
} from './tivvlejoy-real-input-convergence';

describe('TIVVLEJOY_REAL_PRODUCTION_GAP_LEDGER_V1', () => {
  const preflight = compileFirstEpisodePreflight({
    voice: bindEp012VoiceReceipts(),
    candidates: [],
    realApprovedLogicalAssets: 0,
    humanApprovals: 0,
    blenderAvailable: false,
    paidRenderAuthorized: false,
    realMediaReceipts: 0,
  });
  const ledger = compileGapLedger({
    preflight,
    voice: bindEp012VoiceReceipts(),
    realCandidates: 0,
    humanApprovals: 0,
    blenderAvailable: false,
  });

  it('records exact gaps with evidence hashes', () => {
    expect(ledger.schemaVersion).toBe(GAP_LEDGER_SCHEMA);
    expect(ledger.gaps[0]?.gapId).toBe('GAP_PIP_GOAT_PRODUCTION_RIGS');
    expect(ledger.gaps.every((gap) => /^[a-f0-9]{64}$/.test(gap.evidenceSha256))).toBe(true);
  });

  it('ranks a missing rig ahead of purchase/UI polish', () => {
    const ranked = prioritizeGaps(ledger);
    expect(ranked[0]?.category).toBe('RIGS');
    expect(ranked.at(-1)?.gapId).toBe('GAP_NO_NEW_SCENERY_PURCHASE');
    expect(firstEpisodeCriticalPath(ledger)[0]).toMatch(/Pip and Goat production rig/i);
  });

  it('produces a secret-free morning brief and safe next actions', () => {
    const brief = morningBrief({
      listedObjects: 0,
      realDownloads: 0,
      realInspections: 0,
      realCandidates: 0,
      voice: bindEp012VoiceReceipts(),
    });
    expect(brief.secretsIncluded).toBe(false);
    expect(brief.next5SafeActions).toHaveLength(5);
    expect(nextSafeActions(ledger)).toHaveLength(10);
    expect(JSON.stringify(brief)).not.toMatch(/AKIA|sk-|DATABASE_URL|X-Amz-/);
  });
});

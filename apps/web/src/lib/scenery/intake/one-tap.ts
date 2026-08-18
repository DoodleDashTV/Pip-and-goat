import { assessFilenameSafety } from './filename-safety';
import { sanitizeFilename } from './keys';
import {
  EXPECTED_COLLECTION_COUNT,
  EXPECTED_SOURCE_COUNT,
  listExpectedSourceFiles,
  matchAliasOnlyExpectedFilename,
  matchExactExpectedFilename,
  normalizeInventoryFilename,
  type SceneryCollectionId,
} from './inventory';
import { assessSourceSize } from './size-validation';
import { shouldExcludeWorldShadersGiveaway } from './world-shaders';

export const ONE_TAP_UPLOAD_CHECKPOINT = 'TIVVLEJOY_SCENERY_ONE_TAP_UPLOAD_V1';

export type OneTapSelectionInput = {
  filename: string;
  byteSize: number;
};

export type OneTapClassification = 'matched' | 'missing' | 'unexpected' | 'incorrect' | 'duplicate';

export type OneTapReviewItem = {
  filename: string;
  sanitizedFilename: string | null;
  byteSize: number;
  classification: Exclude<OneTapClassification, 'missing'>;
  collectionId: SceneryCollectionId | null;
  collectionName: string | null;
  sourceId: string | null;
  expectedFilename: string | null;
  eligible: boolean;
  reason: string;
};

export type OneTapMissingItem = {
  sourceId: string;
  collectionId: SceneryCollectionId;
  collectionName: string;
  expectedFilename: string;
};

export type OneTapCollectionTotal = {
  collectionId: SceneryCollectionId;
  collectionName: string;
  expected: number;
  matched: number;
  bytes: number;
};

export type OneTapPurchasedReview = {
  checkpoint: typeof ONE_TAP_UPLOAD_CHECKPOINT;
  expectedCount: number;
  collectionCount: number;
  selectedCount: number;
  items: OneTapReviewItem[];
  matched: OneTapReviewItem[];
  missing: OneTapMissingItem[];
  unexpected: OneTapReviewItem[];
  duplicates: OneTapReviewItem[];
  incorrect: OneTapReviewItem[];
  eligible: OneTapReviewItem[];
  collectionTotals: OneTapCollectionTotal[];
  totalMatchedBytes: number;
  overallTotals: {
    expected: number;
    selected: number;
    matched: number;
    missing: number;
    unexpected: number;
    duplicates: number;
    incorrect: number;
    eligible: number;
    refused: number;
    totalMatchedBytes: number;
    totalSelectedBytes: number;
  };
};

function sanitizedOrNull(filename: string): string | null {
  try {
    return sanitizeFilename(filename);
  } catch {
    return null;
  }
}

export function reviewOneTapPurchasedSelection(
  inputs: OneTapSelectionInput[],
  options?: { approvedManifestFilenames?: readonly string[] },
): OneTapPurchasedReview {
  const expected = listExpectedSourceFiles();
  const seenExact = new Map<string, number>();
  const classified: OneTapReviewItem[] = inputs.map((input) => {
    const sanitizedFilename = sanitizedOrNull(input.filename);
    const safety = assessFilenameSafety(input.filename);
    const size = assessSourceSize({ filename: input.filename, declaredBytes: input.byteSize });
    const exact = safety.safe && safety.exactPurchasedMatch ? matchExactExpectedFilename(input.filename) : null;
    const aliasOnly = safety.safe ? matchAliasOnlyExpectedFilename(input.filename) : null;
    const key = exact ? normalizeInventoryFilename(exact.expectedFilename) : normalizeInventoryFilename(input.filename);
    const occurrence = (seenExact.get(key) ?? 0) + 1;
    seenExact.set(key, occurrence);

    if (!safety.safe) {
      return {
        filename: input.filename,
        sanitizedFilename,
        byteSize: input.byteSize,
        classification: 'incorrect',
        collectionId: exact?.collectionId ?? aliasOnly?.collectionId ?? null,
        collectionName: exact?.collectionName ?? aliasOnly?.collectionName ?? null,
        sourceId: exact?.sourceId ?? aliasOnly?.sourceId ?? null,
        expectedFilename: exact?.expectedFilename ?? aliasOnly?.expectedFilename ?? null,
        eligible: false,
        reason: `Unsafe filename refused (${safety.issues.join(', ')}). Source files are not renamed.`,
      };
    }
    if (shouldExcludeWorldShadersGiveaway({
      filename: input.filename,
      approvedManifestFilenames: options?.approvedManifestFilenames,
    })) {
      return {
        filename: input.filename,
        sanitizedFilename,
        byteSize: input.byteSize,
        classification: 'unexpected',
        collectionId: null,
        collectionName: null,
        sourceId: null,
        expectedFilename: null,
        eligible: false,
        reason: 'The free World Shaders giveaway is outside the purchased 27-file requirement.',
      };
    }
    if (!size.ok) {
      return {
        filename: input.filename,
        sanitizedFilename,
        byteSize: input.byteSize,
        classification: 'incorrect',
        collectionId: exact?.collectionId ?? aliasOnly?.collectionId ?? null,
        collectionName: exact?.collectionName ?? aliasOnly?.collectionName ?? null,
        sourceId: exact?.sourceId ?? aliasOnly?.sourceId ?? null,
        expectedFilename: exact?.expectedFilename ?? aliasOnly?.expectedFilename ?? null,
        eligible: false,
        reason: `Incorrect size (${size.issues.join(', ')}). Eligible files are not blocked.`,
      };
    }
    if (occurrence > 1) {
      return {
        filename: input.filename,
        sanitizedFilename,
        byteSize: input.byteSize,
        classification: 'duplicate',
        collectionId: exact?.collectionId ?? aliasOnly?.collectionId ?? null,
        collectionName: exact?.collectionName ?? aliasOnly?.collectionName ?? null,
        sourceId: exact?.sourceId ?? aliasOnly?.sourceId ?? null,
        expectedFilename: exact?.expectedFilename ?? aliasOnly?.expectedFilename ?? null,
        eligible: false,
        reason: 'Duplicate filename in this selection. Only the first exact match is eligible.',
      };
    }
    if (exact) {
      return {
        filename: input.filename,
        sanitizedFilename,
        byteSize: input.byteSize,
        classification: 'matched',
        collectionId: exact.collectionId,
        collectionName: exact.collectionName,
        sourceId: exact.sourceId,
        expectedFilename: exact.expectedFilename,
        eligible: true,
        reason: 'Exact inventory filename matched. Collection card selection is not required.',
      };
    }
    if (aliasOnly) {
      return {
        filename: input.filename,
        sanitizedFilename,
        byteSize: input.byteSize,
        classification: 'incorrect',
        collectionId: aliasOnly.collectionId,
        collectionName: aliasOnly.collectionName,
        sourceId: aliasOnly.sourceId,
        expectedFilename: aliasOnly.expectedFilename,
        eligible: false,
        reason: `Incorrect filename. Use the exact inventory name ${aliasOnly.expectedFilename}.`,
      };
    }
    return {
      filename: input.filename,
      sanitizedFilename,
      byteSize: input.byteSize,
      classification: 'unexpected',
      collectionId: null,
      collectionName: null,
      sourceId: null,
      expectedFilename: null,
      eligible: false,
      reason: 'Filename is not in the expected TivvleJoy scenery inventory.',
    };
  });

  const matched = classified.filter((item) => item.classification === 'matched');
  const matchedIds = new Set(matched.map((item) => item.sourceId));
  const missing = expected
    .filter((item) => !matchedIds.has(item.sourceId))
    .map((item) => ({
      sourceId: item.sourceId,
      collectionId: item.collectionId,
      collectionName: item.collectionName,
      expectedFilename: item.expectedFilename,
    }));

  const collectionTotals = (['village', 'sky-hdri', 'stylized-forest', 'procedural-nature'] as const).map(
    (collectionId) => {
      const collectionExpected = expected.filter((item) => item.collectionId === collectionId);
      const collectionMatched = matched.filter((item) => item.collectionId === collectionId);
      return {
        collectionId,
        collectionName: collectionExpected[0]?.collectionName ?? collectionId,
        expected: collectionExpected.length,
        matched: collectionMatched.length,
        bytes: collectionMatched.reduce((sum, item) => sum + item.byteSize, 0),
      };
    },
  );

  return {
    checkpoint: ONE_TAP_UPLOAD_CHECKPOINT,
    expectedCount: EXPECTED_SOURCE_COUNT,
    collectionCount: EXPECTED_COLLECTION_COUNT,
    selectedCount: inputs.length,
    items: classified,
    matched,
    missing,
    unexpected: classified.filter((item) => item.classification === 'unexpected'),
    duplicates: classified.filter((item) => item.classification === 'duplicate'),
    incorrect: classified.filter((item) => item.classification === 'incorrect'),
    eligible: classified.filter((item) => item.eligible),
    collectionTotals,
    totalMatchedBytes: matched.reduce((sum, item) => sum + item.byteSize, 0),
    overallTotals: {
      expected: EXPECTED_SOURCE_COUNT,
      selected: inputs.length,
      matched: matched.length,
      missing: missing.length,
      unexpected: classified.filter((item) => item.classification === 'unexpected').length,
      duplicates: classified.filter((item) => item.classification === 'duplicate').length,
      incorrect: classified.filter((item) => item.classification === 'incorrect').length,
      eligible: classified.filter((item) => item.eligible).length,
      refused: classified.filter((item) => !item.eligible).length,
      totalMatchedBytes: matched.reduce((sum, item) => sum + item.byteSize, 0),
      totalSelectedBytes: inputs.reduce((sum, item) => sum + item.byteSize, 0),
    },
  };
}

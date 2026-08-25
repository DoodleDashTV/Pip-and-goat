export const EP001_REVIEW_WORKSHEET_SCHEMA = 'TIVVLEJOY_EP001_REVIEW_WORKSHEET_V1' as const;
export const EP001_REVIEW_EXPORT_SCHEMA = 'TIVVLEJOY_EP001_REVIEW_HANDOFF_V1' as const;
export const EP001_REVIEW_STORAGE_KEY = 'tivvlejoy.ep001.review-worksheet.v1' as const;
export const EP001_REVIEW_NOTES_MAX_CHARS = 4_000 as const;

export const EP001_REVIEW_ITEMS = [
  {
    id: 'HOOK_READS_IMMEDIATELY',
    title: 'The hook reads immediately',
    description: 'The loose map fragment is understandable in the opening five seconds.',
  },
  {
    id: 'FRIENDSHIP_THEME_FITS',
    title: 'The friendship theme fits',
    description: 'Pip looking high and Goat looking low make their differences useful.',
  },
  {
    id: 'DIALOGUE_SOUNDS_NATURAL',
    title: 'The dialogue sounds natural',
    description: 'All eight lines feel clear, warm, playful, and right for ages 5–10.',
  },
  {
    id: 'ENDING_INVITES_NEXT_EPISODE',
    title: 'The ending invites another episode',
    description: 'The new path and snack joke create a satisfying button without overexplaining.',
  },
  {
    id: 'SHOT_ORDER_IS_CLEAR',
    title: 'The shot order is clear',
    description: 'The action progresses from bakery to street to meadow without confusion.',
  },
  {
    id: 'CHARACTER_ACTIONS_ARE_DISTINCT',
    title: 'Pip and Goat have distinct actions',
    description: 'Each character contributes to the discovery and shared payoff.',
  },
  {
    id: 'CAPTION_TIMING_IS_READABLE',
    title: 'The caption timing looks readable',
    description: 'Dialogue placement leaves enough room for a comfortable vertical-screen read.',
  },
  {
    id: 'HANDOFF_NOTES_ARE_CAPTURED',
    title: 'Handoff notes are captured',
    description: 'Any story, camera, rig, or performance changes are written below.',
  },
] as const;

export type Ep001ReviewItemId = (typeof EP001_REVIEW_ITEMS)[number]['id'];
export type Ep001ReviewDisposition = 'IN_REVIEW' | 'NEEDS_CHANGES' | 'READY_FOR_LATER_APPROVAL';

export type Ep001ReviewWorksheet = {
  schemaVersion: typeof EP001_REVIEW_WORKSHEET_SCHEMA;
  episodeId: 'EP001';
  packageSha256: string;
  disposition: Ep001ReviewDisposition;
  completedItemIds: Ep001ReviewItemId[];
  notes: string;
  savedAt: string | null;
  canonicalApprovalIssued: false;
  visualApprovalIssued: false;
  productionWriteAllowed: false;
};

export type Ep001ReviewStorage = Pick<Storage, 'getItem' | 'setItem'>;

const REVIEW_ITEM_IDS = new Set<string>(EP001_REVIEW_ITEMS.map((item) => item.id));
const REVIEW_DISPOSITIONS = new Set<Ep001ReviewDisposition>([
  'IN_REVIEW',
  'NEEDS_CHANGES',
  'READY_FOR_LATER_APPROVAL',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createEmptyEp001ReviewWorksheet(packageSha256: string): Ep001ReviewWorksheet {
  return {
    schemaVersion: EP001_REVIEW_WORKSHEET_SCHEMA,
    episodeId: 'EP001',
    packageSha256,
    disposition: 'IN_REVIEW',
    completedItemIds: [],
    notes: '',
    savedAt: null,
    canonicalApprovalIssued: false,
    visualApprovalIssued: false,
    productionWriteAllowed: false,
  };
}

export function parseEp001ReviewWorksheet(
  raw: string,
  expectedPackageSha256: string,
): Ep001ReviewWorksheet | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.schemaVersion !== EP001_REVIEW_WORKSHEET_SCHEMA) return null;
    if (parsed.episodeId !== 'EP001') return null;
    if (parsed.packageSha256 !== expectedPackageSha256) return null;
    if (!REVIEW_DISPOSITIONS.has(parsed.disposition as Ep001ReviewDisposition)) return null;
    if (!Array.isArray(parsed.completedItemIds)) return null;
    if (
      !parsed.completedItemIds.every(
        (item) => typeof item === 'string' && REVIEW_ITEM_IDS.has(item),
      )
    ) {
      return null;
    }
    if (typeof parsed.notes !== 'string' || parsed.notes.length > EP001_REVIEW_NOTES_MAX_CHARS) {
      return null;
    }
    if (parsed.savedAt !== null && typeof parsed.savedAt !== 'string') return null;
    if (
      parsed.canonicalApprovalIssued !== false ||
      parsed.visualApprovalIssued !== false ||
      parsed.productionWriteAllowed !== false
    ) {
      return null;
    }

    const selected = new Set(parsed.completedItemIds);
    return {
      schemaVersion: EP001_REVIEW_WORKSHEET_SCHEMA,
      episodeId: 'EP001',
      packageSha256: expectedPackageSha256,
      disposition: parsed.disposition as Ep001ReviewDisposition,
      completedItemIds: EP001_REVIEW_ITEMS.map((item) => item.id).filter((id) => selected.has(id)),
      notes: parsed.notes,
      savedAt: parsed.savedAt,
      canonicalApprovalIssued: false,
      visualApprovalIssued: false,
      productionWriteAllowed: false,
    };
  } catch {
    return null;
  }
}

export function readEp001ReviewWorksheet(
  storage: Ep001ReviewStorage,
  packageSha256: string,
): Ep001ReviewWorksheet {
  try {
    const raw = storage.getItem(EP001_REVIEW_STORAGE_KEY);
    if (!raw) return createEmptyEp001ReviewWorksheet(packageSha256);
    return (
      parseEp001ReviewWorksheet(raw, packageSha256) ??
      createEmptyEp001ReviewWorksheet(packageSha256)
    );
  } catch {
    return createEmptyEp001ReviewWorksheet(packageSha256);
  }
}

export function writeEp001ReviewWorksheet(
  storage: Ep001ReviewStorage,
  worksheet: Ep001ReviewWorksheet,
): boolean {
  try {
    const safeWorksheet: Ep001ReviewWorksheet = {
      ...worksheet,
      completedItemIds: EP001_REVIEW_ITEMS.map((item) => item.id).filter((id) =>
        worksheet.completedItemIds.includes(id),
      ),
      notes: worksheet.notes.slice(0, EP001_REVIEW_NOTES_MAX_CHARS),
      canonicalApprovalIssued: false,
      visualApprovalIssued: false,
      productionWriteAllowed: false,
    };
    storage.setItem(EP001_REVIEW_STORAGE_KEY, JSON.stringify(safeWorksheet));
    return true;
  } catch {
    return false;
  }
}

export function buildEp001ReviewExport(worksheet: Ep001ReviewWorksheet, exportedAt: string) {
  return {
    schemaVersion: EP001_REVIEW_EXPORT_SCHEMA,
    exportedAt,
    worksheet: {
      ...worksheet,
      canonicalApprovalIssued: false as const,
      visualApprovalIssued: false as const,
      productionWriteAllowed: false as const,
    },
    authority: {
      clearsReadinessBlockers: false as const,
      countsAsHumanStoryApproval: false as const,
      countsAsHumanVisualApproval: false as const,
      permitsPaidExecution: false as const,
      permitsPublishing: false as const,
    },
  };
}

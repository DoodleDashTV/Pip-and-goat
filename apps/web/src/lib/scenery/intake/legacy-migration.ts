import {
  ARCHIVE_CONTENT_EXPECTATIONS,
  EXPECTED_SCENERY_SOURCE_FILES,
  LEGACY_27_FILE_COUNT,
  LEGACY_30_FILE_COUNT,
  getExpectedSourceFile,
  isOfficialSourceId,
  lookupSourceOrArchive,
  matchArchiveContentFilename,
  matchOfficialDownloadAnywhere,
  type ExpectedSourceFile,
  type ManifestCollectionId,
} from './inventory';

export type LegacyInventoryKind = '14-file' | '27-file' | '30-file' | 'unknown';

export type LegacySourceRecord = {
  sourceId?: string;
  collectionId?: string;
  originalFilename?: string;
  expectedFilename?: string;
};

export type MigratedSourceRecord = {
  kind: 'official' | 'archive_content' | 'unknown';
  officialSourceId: string | null;
  archiveContentId: string | null;
  collectionId: ManifestCollectionId | null;
  expectedFilename: string | null;
  countsAsMissingDownload: boolean;
  remapped: boolean;
  notes: string[];
};

const FORMER_HDRI_PART_2_SOURCE_ID = 'SRC_FOREST_MODEL_PACKAGE';

export function classifyLegacyInventorySize(count: number): LegacyInventoryKind {
  if (count === 14) return '14-file';
  if (count === LEGACY_27_FILE_COUNT) return '27-file';
  if (count === LEGACY_30_FILE_COUNT) return '30-file';
  return 'unknown';
}

export function migrateLegacySourceRecord(record: LegacySourceRecord): MigratedSourceRecord {
  const notes: string[] = [];
  const filename = record.originalFilename || record.expectedFilename || '';

  if (record.sourceId && isOfficialSourceId(record.sourceId)) {
    const official = getExpectedSourceFile(record.sourceId);
    const remappedFilename = Boolean(filename) && filename !== official.expectedFilename;
    if (record.sourceId === FORMER_HDRI_PART_2_SOURCE_ID && /hdri.?part.?2/i.test(filename)) {
      const archive = matchArchiveContentFilename(filename);
      notes.push(
        'HDRI_Part_2.zip is archive content of HDRi_JPG_Pack.zip, not the Stylized Forest download.',
      );
      return {
        kind: 'archive_content',
        officialSourceId: archive?.parentSourceId ?? 'SRC_SKY_HDRI_JPG_PACK',
        archiveContentId: archive?.contentId ?? 'AC_SKY_HDRI_PART_2',
        collectionId: 'sky-hdri',
        expectedFilename: archive?.expectedFilename ?? 'HDRI_Part_2.zip',
        countsAsMissingDownload: false,
        remapped: true,
        notes,
      };
    }
    if (remappedFilename && filename) {
      notes.push(`Preserved source ID ${official.sourceId}; official filename is now ${official.expectedFilename}.`);
    }
    if (record.collectionId && record.collectionId !== official.collectionId) {
      notes.push(
        `Collection remapped from ${record.collectionId} to ${official.collectionId}. Stored objects were not moved.`,
      );
    }
    return {
      kind: 'official',
      officialSourceId: official.sourceId,
      archiveContentId: null,
      collectionId: official.collectionId,
      expectedFilename: official.expectedFilename,
      countsAsMissingDownload: true,
      remapped: remappedFilename || record.collectionId !== official.collectionId,
      notes,
    };
  }

  if (record.sourceId) {
    try {
      const lookup = lookupSourceOrArchive(record.sourceId);
      if (lookup.kind === 'archive_content' && lookup.archive) {
        notes.push(
          `${lookup.archive.expectedFilename} is internal archive content of ${lookup.archive.parentSourceId}. It is not a missing download.`,
        );
        return {
          kind: 'archive_content',
          officialSourceId: lookup.archive.parentSourceId,
          archiveContentId: lookup.archive.contentId,
          collectionId: lookup.archive.collectionId,
          expectedFilename: lookup.archive.expectedFilename,
          countsAsMissingDownload: false,
          remapped: true,
          notes,
        };
      }
    } catch {
      notes.push('Source ID is not in the official 14-file inventory or archive-content map.');
    }
  }

  const officialByName = filename ? matchOfficialDownloadAnywhere(filename) : null;
  if (officialByName) {
    notes.push(`Matched official download ${officialByName.expectedFilename} by filename alias.`);
    return {
      kind: 'official',
      officialSourceId: officialByName.sourceId,
      archiveContentId: null,
      collectionId: officialByName.collectionId,
      expectedFilename: officialByName.expectedFilename,
      countsAsMissingDownload: true,
      remapped: officialByName.sourceId !== record.sourceId,
      notes,
    };
  }

  const archiveByName = filename ? matchArchiveContentFilename(filename) : null;
  if (archiveByName) {
    notes.push(
      `${archiveByName.expectedFilename} is archive content of ${archiveByName.parentSourceId} and does not count as a missing download.`,
    );
    return {
      kind: 'archive_content',
      officialSourceId: archiveByName.parentSourceId,
      archiveContentId: archiveByName.contentId,
      collectionId: archiveByName.collectionId,
      expectedFilename: archiveByName.expectedFilename,
      countsAsMissingDownload: false,
      remapped: true,
      notes,
    };
  }

  return {
    kind: 'unknown',
    officialSourceId: null,
    archiveContentId: null,
    collectionId: null,
    expectedFilename: filename || null,
    countsAsMissingDownload: false,
    remapped: false,
    notes: notes.length ? notes : ['Record does not map to an official 14-file download or known archive content.'],
  };
}

export function migrateLegacyInventory(records: LegacySourceRecord[]): {
  official: MigratedSourceRecord[];
  archiveContent: MigratedSourceRecord[];
  unknown: MigratedSourceRecord[];
  missingOfficialDownloads: ExpectedSourceFile[];
} {
  const migrated = records.map(migrateLegacySourceRecord);
  const officialIds = new Set(
    migrated.filter((item) => item.kind === 'official' && item.officialSourceId).map((item) => item.officialSourceId),
  );
  return {
    official: migrated.filter((item) => item.kind === 'official'),
    archiveContent: migrated.filter((item) => item.kind === 'archive_content'),
    unknown: migrated.filter((item) => item.kind === 'unknown'),
    missingOfficialDownloads: EXPECTED_SCENERY_SOURCE_FILES.filter((item) => !officialIds.has(item.sourceId)),
  };
}

export function formerSourceIdsAreNotMissingDownloads(): string[] {
  return ARCHIVE_CONTENT_EXPECTATIONS.map((item) => item.formerSourceId);
}

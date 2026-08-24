import { SCENERY_PROHIBITED_EXTENSIONS } from '@/lib/scenery/intake/limits';
import { assertSafeRelativeArchivePath, fileExtension } from '@/lib/scenery/intake/keys';
import { listZipEntriesStreaming, memoryByteSource, type SafeArchiveInspection } from '@/lib/scenery/intake/safe-archive-inspect';
import { rejectArchiveEntry } from '@/lib/scenery/intake/quarantine';
import { GOAT_REQUIRED_ARCHIVE_MEMBERS } from './goat-spec';
import { CharacterSourceError } from './keys';

export { preflightGoatUpload, verifyGoatSourceHash, verifyGoatSourceSize } from './preflight';

export async function inspectGoatZipBytes(bytes: Uint8Array): Promise<{
  ok: boolean;
  zipIntegrityVerified: boolean;
  code: string;
  reason: string;
  members: string[];
  inspection: SafeArchiveInspection | null;
}> {
  try {
    const entries = await listZipEntriesStreaming(memoryByteSource(bytes));
    const members = entries.filter((item) => !item.directory).map((item) => item.path);
    const findings: string[] = [];
    for (const entry of entries) {
      try {
        assertSafeRelativeArchivePath(entry.path);
      } catch {
        findings.push(`TRAVERSAL:${entry.path}`);
      }
      const ext = fileExtension(entry.path);
      if ((SCENERY_PROHIBITED_EXTENSIONS as readonly string[]).includes(ext)) {
        findings.push(`PROHIBITED:${entry.path}`);
      }
      findings.push(...rejectArchiveEntry(entry.path).map((item) => item.code));
    }
    const hasBlend = members.some((path) => path.replace(/\\/g, '/').endsWith(GOAT_REQUIRED_ARCHIVE_MEMBERS.blend));
    const hasFbx = members.some((path) => path.replace(/\\/g, '/').endsWith(GOAT_REQUIRED_ARCHIVE_MEMBERS.fbx));
    if (!hasBlend) findings.push('MISSING_BLEND');
    if (!hasFbx) findings.push('MISSING_FBX');
    if (findings.some((item) => item.startsWith('TRAVERSAL:') || item === 'ARCHIVE_PATH_TRAVERSAL')) {
      return {
        ok: false,
        zipIntegrityVerified: false,
        code: 'ZIP_TRAVERSAL',
        reason: 'Archive contains a path-traversal entry.',
        members,
        inspection: null,
      };
    }
    if (findings.some((item) => item.startsWith('PROHIBITED:') || item === 'PROHIBITED_EXTENSION')) {
      return {
        ok: false,
        zipIntegrityVerified: false,
        code: 'ZIP_PROHIBITED_PAYLOAD',
        reason: 'Archive contains a prohibited executable or script payload.',
        members,
        inspection: null,
      };
    }
    if (findings.includes('MISSING_BLEND') || findings.includes('MISSING_FBX')) {
      return {
        ok: false,
        zipIntegrityVerified: true,
        code: 'MISSING_REQUIRED_FILE',
        reason: 'Archive is missing Goat_FINN.blend or Goat_FINN.fbx.',
        members,
        inspection: null,
      };
    }
    return {
      ok: true,
      zipIntegrityVerified: true,
      code: 'ZIP_SAFE',
      reason: 'ZIP central directory is readable and required Goat members are present.',
      members,
      inspection: null,
    };
  } catch (error) {
    throw new CharacterSourceError(
      error instanceof Error ? error.message : 'ZIP integrity check failed.',
      'ZIP_CORRUPT',
    );
  }
}

export async function inspectGoatZipOrFail(bytes: Uint8Array) {
  try {
    return await inspectGoatZipBytes(bytes);
  } catch (error) {
    if (error instanceof CharacterSourceError && error.code === 'ZIP_CORRUPT') {
      return {
        ok: false,
        zipIntegrityVerified: false,
        code: 'ZIP_CORRUPT',
        reason: error.message,
        members: [] as string[],
        inspection: null,
      };
    }
    throw error;
  }
}

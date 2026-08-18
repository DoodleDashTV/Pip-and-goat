import { matchExactExpectedFilename } from './inventory';

const CONTROL_CHAR = /[\u0000-\u001f\u007f-\u009f]/;
const TRAVERSAL = /(^|[\\/])\.\.([\\/]|$)/;
const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;
const ABSOLUTE_PREFIX = /^[\\/]/;
const BACKSLASH = /\\/;
const NUL = /\u0000/;
const UNICODE_AMBIGUITY =
  /[^\u0000-\u007f]|[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]|[\u0300-\u036f]|[\uff01-\uff5e]/;

export type FilenameSafetyIssue =
  | 'empty_filename'
  | 'control_character'
  | 'nul_byte'
  | 'path_traversal'
  | 'absolute_path'
  | 'windows_drive'
  | 'backslash_separator'
  | 'unicode_ambiguity'
  | 'prefix_escape'
  | 'whitespace_padding';

export type FilenameSafetyAssessment = {
  filename: string;
  basename: string;
  safe: boolean;
  issues: FilenameSafetyIssue[];
  exactPurchasedMatch: boolean;
};

function basenameOnly(filename: string): string {
  const trimmed = filename.replace(/\\/g, '/');
  const parts = trimmed.split('/');
  return parts[parts.length - 1] ?? filename;
}

export function assessFilenameSafety(filename: string): FilenameSafetyAssessment {
  const issues: FilenameSafetyIssue[] = [];
  if (!filename) {
    issues.push('empty_filename');
  }
  if (NUL.test(filename) || filename.includes('\0')) {
    issues.push('nul_byte');
  }
  if (CONTROL_CHAR.test(filename)) {
    issues.push('control_character');
  }
  if (TRAVERSAL.test(filename) || filename.includes('..')) {
    issues.push('path_traversal');
  }
  if (ABSOLUTE_PREFIX.test(filename)) {
    issues.push('absolute_path');
    issues.push('prefix_escape');
  }
  if (WINDOWS_DRIVE.test(filename)) {
    issues.push('windows_drive');
    issues.push('prefix_escape');
  }
  if (BACKSLASH.test(filename)) {
    issues.push('backslash_separator');
  }
  if (filename !== filename.trim() || /\s{2,}/.test(filename)) {
    issues.push('whitespace_padding');
  }
  if (UNICODE_AMBIGUITY.test(filename)) {
    issues.push('unicode_ambiguity');
  }
  const basename = basenameOnly(filename);
  if (basename !== filename && filename.includes('/')) {
    issues.push('path_traversal');
    issues.push('prefix_escape');
  }
  const exact = matchExactExpectedFilename(basename);
  return {
    filename,
    basename,
    safe: issues.length === 0,
    issues: Array.from(new Set(issues)),
    exactPurchasedMatch: Boolean(exact),
  };
}

export function assertSafeSourceFilename(filename: string): FilenameSafetyAssessment {
  return assessFilenameSafety(filename);
}

export function isUnicodeConfusableFilename(filename: string): boolean {
  return UNICODE_AMBIGUITY.test(filename);
}

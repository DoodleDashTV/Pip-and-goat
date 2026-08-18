import { buildMinimalZip } from './archive';
import { sha256HexChunked } from './hash';

export const SYNTHETIC_INTAKE_TEXT = 'TivvleJoy synthetic scenery fixture. No commercial geometry.\n';

export const PREVIEW_SYNTHETIC_SOURCE_ID = 'SRC_PREVIEW_SYNTHETIC';
export const PREVIEW_SYNTHETIC_FILENAME_PREFIX = 'tivvlejoy-preview-synthetic-';
export const PREVIEW_SYNTHETIC_TEXT =
  'TivvleJoy preview-only synthetic fixture. No purchased scenery content.\n';

export function previewSyntheticFilename(label = 'intake'): string {
  const safe = label.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'intake';
  return `${PREVIEW_SYNTHETIC_FILENAME_PREFIX}${safe}.txt`;
}

export function previewSyntheticBytes(label = 'intake'): Uint8Array {
  return new TextEncoder().encode(`${PREVIEW_SYNTHETIC_TEXT}${label}\n`);
}

export function syntheticFixtureBytes(label = 'village'): Uint8Array {
  return new TextEncoder().encode(`${SYNTHETIC_INTAKE_TEXT}${label}\n`);
}

export function syntheticFixtureZip(label = 'village'): Uint8Array {
  return buildMinimalZip([
    { path: `${label}/readme.txt`, content: syntheticFixtureBytes(label) },
    { path: `${label}/preview.jpg`, content: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
  ]);
}

export function syntheticTraversalZip(): Uint8Array {
  return buildMinimalZip([{ path: '../escape/secret.blend', content: syntheticFixtureBytes('traverse') }]);
}

export function syntheticExecutableZip(): Uint8Array {
  return buildMinimalZip([{ path: 'payload.exe', content: syntheticFixtureBytes('exe') }]);
}

export function syntheticFixtureRecord(label = 'village') {
  const bytes = syntheticFixtureZip(label);
  return {
    filename: `${label}-fixture.zip`,
    bytes,
    byteSize: bytes.byteLength,
    sha256: sha256HexChunked(bytes),
    commercial: false,
  };
}

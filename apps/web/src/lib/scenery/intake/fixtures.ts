import { buildMinimalZip } from './archive';
import { sha256HexChunked } from './hash';

export const SYNTHETIC_INTAKE_TEXT = 'TivvleJoy synthetic scenery fixture. No commercial geometry.\n';

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

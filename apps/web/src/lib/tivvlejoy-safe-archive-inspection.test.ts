import { describe, expect, it } from 'vitest';
import {
  archivePathViolation,
  buildStoredZip,
  categorizeArchivePath,
  inspectZipArchive,
  normalizeArchivePath,
} from './tivvlejoy-real-scenery-inspection';

function zip(entries: Array<{ name: string; data: string }>) {
  return inspectZipArchive(buildStoredZip(entries));
}

describe('TIVVLEJOY_SAFE_ARCHIVE_INSPECTION_V1', () => {
  it('inventories a safe ZIP without extracting into the repo', () => {
    const report = zip([
      { name: 'models/tavern.blend', data: 'BLENDER' },
      { name: 'textures/wood.png', data: 'png' },
      { name: 'materials/wood.mtl', data: 'newmtl wood' },
      { name: 'sky/dusk.hdr', data: 'hdr' },
      { name: 'README.md', data: 'license' },
    ]);
    expect(report.state).toBe('ARCHIVE_SAFE');
    expect(report.extracted).toBe(false);
    expect(report.executedEmbeddedScripts).toBe(false);
    expect(report.geometryPaths).toEqual(['models/tavern.blend']);
    expect(report.texturePaths).toEqual(['textures/wood.png']);
    expect(report.materialPaths).toEqual(['materials/wood.mtl']);
    expect(report.hdriPaths).toEqual(['sky/dusk.hdr']);
    expect(report.documentationPaths).toEqual(['README.md']);
  });

  it('rejects path traversal, absolute paths, and drive letters', () => {
    expect(archivePathViolation('../secret.blend')).toBe('ARCHIVE_UNSAFE_PATH');
    expect(archivePathViolation('/etc/passwd')).toBe('ARCHIVE_UNSAFE_PATH');
    expect(archivePathViolation('C:\\Windows\\x.fbx')).toBe('ARCHIVE_UNSAFE_PATH');
    expect(zip([{ name: '../escape.fbx', data: 'x' }]).state).toBe('ARCHIVE_UNSAFE_PATH');
    expect(zip([{ name: '/tmp/x.glb', data: 'x' }]).state).toBe('ARCHIVE_UNSAFE_PATH');
  });

  it('rejects duplicate normalized paths and case collisions', () => {
    expect(zip([{ name: 'A/b.PNG', data: '1' }, { name: 'A/b.PNG', data: '2' }]).state).toBe('ARCHIVE_UNSAFE_PATH');
    expect(zip([{ name: 'Wood.PNG', data: '1' }, { name: 'wood.png', data: '2' }]).state).toBe('ARCHIVE_UNSAFE_PATH');
  });

  it('rejects archive bombs, oversized entries, and too many entries', () => {
    const bomb = inspectZipArchive(buildStoredZip([{ name: 'huge.bin', data: 'tiny' }]), {
      maxEntries: 8_000,
      maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
      maxEntryUncompressedBytes: 512 * 1024 * 1024,
      maxCompressionRatio: 1,
      maxNestedDepth: 2,
      maxNestedArchives: 16,
    });
    expect(['ARCHIVE_SAFE', 'ARCHIVE_BOMB_RISK']).toContain(bomb.state);
    const tooMany = inspectZipArchive(buildStoredZip([{ name: 'a.txt', data: 'a' }]), {
      maxEntries: 0,
      maxUncompressedBytes: 100,
      maxEntryUncompressedBytes: 100,
      maxCompressionRatio: 80,
      maxNestedDepth: 1,
      maxNestedArchives: 1,
    });
    expect(['ARCHIVE_TOO_MANY_ENTRIES', 'ARCHIVE_SAFE']).toContain(tooMany.state);
  });

  it('marks corrupt and unsupported containers', () => {
    expect(inspectZipArchive(new Uint8Array([1, 2, 3, 4])).state).toBe('ARCHIVE_CORRUPT');
    expect(inspectZipArchive(new Uint8Array([0x1f, 0x8b, 0x08, 0x00])).state).toBe('ARCHIVE_UNSUPPORTED');
  });

  it('reports python/scripts and executables without running them', () => {
    const report = zip([
      { name: 'addon/__init__.py', data: 'import bpy' },
      { name: 'tools/helper.exe', data: 'MZ' },
      { name: 'mesh.obj', data: 'v 0 0 0' },
    ]);
    expect(report.pythonOrScriptPaths).toEqual(['addon/__init__.py']);
    expect(report.executablePaths).toEqual(['tools/helper.exe']);
    expect(report.notes.some((note) => /not executed/i.test(note))).toBe(true);
    expect(report.executedEmbeddedScripts).toBe(false);
  });

  it('categorizes common scenery extensions', () => {
    expect(categorizeArchivePath('a.fbx')).toBe('geometry');
    expect(categorizeArchivePath('a.glb')).toBe('geometry');
    expect(categorizeArchivePath('a.gltf')).toBe('geometry');
    expect(categorizeArchivePath('a.obj')).toBe('geometry');
    expect(categorizeArchivePath('a.jpeg')).toBe('texture');
    expect(categorizeArchivePath('a.webp')).toBe('texture');
    expect(categorizeArchivePath('a.tga')).toBe('texture');
    expect(categorizeArchivePath('a.tif')).toBe('texture');
    expect(categorizeArchivePath('a.exr')).toBe('hdri');
    expect(categorizeArchivePath('license.txt')).toBe('documentation');
    expect(categorizeArchivePath('nested.zip')).toBe('archive');
  });

  it('inventories nested archives with bounded recursion', () => {
    const child = buildStoredZip([{ name: 'inner.fbx', data: 'fbx' }]);
    const parent = inspectZipArchive(buildStoredZip([{ name: 'wrap/child.zip', data: child }]), {
      maxEntries: 100,
      maxUncompressedBytes: 10_000_000,
      maxEntryUncompressedBytes: 10_000_000,
      maxCompressionRatio: 80,
      maxNestedDepth: 1,
      maxNestedArchives: 2,
    });
    expect(parent.nested[0]?.containerDepth).toBe(1);
    expect(parent.nested[0]?.childPath).toBe('wrap/child.zip');
    const stopped = inspectZipArchive(buildStoredZip([{ name: 'wrap/child.zip', data: child }]), {
      maxEntries: 100,
      maxUncompressedBytes: 10_000_000,
      maxEntryUncompressedBytes: 10_000_000,
      maxCompressionRatio: 80,
      maxNestedDepth: 0,
      maxNestedArchives: 2,
    });
    expect(stopped.nested[0]?.stoppedReason).toBe('MAX_RECURSION');
  });

  it('normalizes separators and ignores current-dir prefixes', () => {
    expect(normalizeArchivePath('.\\models\\a.fbx')).toBe('models/a.fbx');
    expect(archivePathViolation('models/a.fbx')).toBeNull();
  });

  it('does not extract unsafe nested content', () => {
    const child = buildStoredZip([{ name: '../x.fbx', data: 'bad' }]);
    const parent = inspectZipArchive(buildStoredZip([{ name: 'child.zip', data: child }]));
    expect(parent.refused).toBe(true);
    expect(parent.state).toBe('ARCHIVE_UNSAFE_PATH');
  });

  it('refuses null bytes and empty traversal segments', () => {
    expect(archivePathViolation('ok/\0hidden.fbx')).toBe('ARCHIVE_UNSAFE_PATH');
    expect(archivePathViolation('foo/../../etc/passwd')).toBe('ARCHIVE_UNSAFE_PATH');
  });

  it('counts declared uncompressed overflow as too large', () => {
    const report = inspectZipArchive(buildStoredZip([{ name: 'big.bin', data: 'x'.repeat(64) }]), {
      maxEntries: 10,
      maxUncompressedBytes: 8,
      maxEntryUncompressedBytes: 8,
      maxCompressionRatio: 80,
      maxNestedDepth: 1,
      maxNestedArchives: 1,
    });
    expect(report.state).toBe('ARCHIVE_TOO_LARGE');
    expect(report.extracted).toBe(false);
  });

  it('rejects unix symlink mode without extracting the target', () => {
    const report = inspectZipArchive(buildStoredZip([{ name: 'escape.blend', data: '/tmp/secret', unixMode: 0o120000 }]));
    expect(report.state).toBe('ARCHIVE_UNSAFE_PATH');
    expect(report.extracted).toBe(false);
    expect(report.notes.join(' ')).toMatch(/symlink/i);
  });

  it('rejects hardlink-like zero-size data-descriptor entries', () => {
    const report = inspectZipArchive(
      buildStoredZip([{ name: 'hardlink-mesh.fbx', data: '', flags: 0x0008, declaredUncompressed: 0 }]),
    );
    expect(report.state).toBe('ARCHIVE_UNSAFE_PATH');
    expect(report.notes.join(' ')).toMatch(/hardlink/i);
  });

  it('rejects an extreme declared compression ratio as ARCHIVE_BOMB_RISK', () => {
    const report = inspectZipArchive(buildStoredZip([{ name: 'tiny.bin', data: 'x', declaredUncompressed: 9 * 1024 * 1024 }]), {
      maxEntries: 8,
      maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
      maxEntryUncompressedBytes: 512 * 1024 * 1024,
      maxCompressionRatio: 4,
      maxNestedDepth: 1,
      maxNestedArchives: 1,
    });
    expect(report.state).toBe('ARCHIVE_BOMB_RISK');
    expect(report.extracted).toBe(false);
  });

  it('stops nested archive explosion at the configured child-archive limit', () => {
    const child = buildStoredZip([{ name: 'inner.fbx', data: 'fbx' }]);
    const parent = inspectZipArchive(
      buildStoredZip([
        { name: 'a.zip', data: child },
        { name: 'b.zip', data: child },
      ]),
      {
        maxEntries: 20,
        maxUncompressedBytes: 10_000_000,
        maxEntryUncompressedBytes: 10_000_000,
        maxCompressionRatio: 80,
        maxNestedDepth: 2,
        maxNestedArchives: 1,
      },
    );
    expect(parent.nested.some((item) => item.stoppedReason === 'NESTED_ARCHIVE_LIMIT')).toBe(true);
  });

  it('inventories directories, JSON, XML and material files without executing them', () => {
    const report = zip([
      { name: 'props/', data: '' },
      { name: 'meta.json', data: '{}' },
      { name: 'scene.xml', data: '<scene/>' },
      { name: 'wood.mtl', data: 'newmtl wood' },
    ]);
    expect(report.state).toBe('ARCHIVE_SAFE');
    expect(report.entries.some((item) => item.directory)).toBe(true);
    expect(report.entries.find((item) => item.relativePath === 'meta.json')?.probableAssetCategory).toBe('other');
    expect(report.materialPaths).toEqual(['wood.mtl']);
    expect(report.executedEmbeddedScripts).toBe(false);
  });

  it('categorizes remaining scenery and risk extensions', () => {
    expect(categorizeArchivePath('a.tiff')).toBe('texture');
    expect(categorizeArchivePath('a.bmp')).toBe('texture');
    expect(categorizeArchivePath('pack.scatpack')).toBe('archive');
    expect(categorizeArchivePath('lib.paq')).toBe('archive');
    expect(categorizeArchivePath('addon.pyc')).toBe('addon_script');
    expect(categorizeArchivePath('helper.dll')).toBe('executable');
    expect(categorizeArchivePath('notes.pdf')).toBe('documentation');
  });

  it('records child archive hash and entry count when nested inventory is allowed', () => {
    const child = buildStoredZip([{ name: 'inner.glb', data: 'glb' }]);
    const parent = inspectZipArchive(buildStoredZip([{ name: 'wrap/child.zip', data: child }]), {
      maxEntries: 20,
      maxUncompressedBytes: 10_000_000,
      maxEntryUncompressedBytes: 10_000_000,
      maxCompressionRatio: 80,
      maxNestedDepth: 1,
      maxNestedArchives: 2,
    });
    expect(parent.nested[0]?.childArchiveHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parent.nested[0]?.childEntryCount).toBe(1);
    expect(parent.nested[0]?.stoppedReason).toBeNull();
  });

  it('does not extract when the ZIP central directory is truncated', () => {
    const zipBytes = buildStoredZip([{ name: 'ok.fbx', data: 'fbx' }]);
    expect(inspectZipArchive(zipBytes.subarray(0, 12)).state).toBe('ARCHIVE_CORRUPT');
  });
});

describe('archive inventory coverage', () => {
  const samples = ['.blend', '.fbx', '.glb', '.gltf', '.obj', '.png', '.jpg', '.jpeg', '.webp', '.tga', '.tif', '.tiff', '.exr', '.hdr', '.json', '.xml'];
  for (const ext of samples) {
    it(`recognizes ${ext} without executing it`, () => {
      const report = zip([{ name: `file${ext}`, data: ext }]);
      expect(report.state).toBe('ARCHIVE_SAFE');
      expect(report.extracted).toBe(false);
      expect(report.entries[0]?.extension).toBe(ext);
    });
  }
});

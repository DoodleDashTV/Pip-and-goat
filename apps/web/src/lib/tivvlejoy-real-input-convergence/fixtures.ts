import { blendHeaderBytes, fbxBinaryHeader } from '@/lib/tivvlejoy-real-scenery-inspection/fixtures';
import { buildMinimalGlb } from '@/lib/tivvlejoy-real-scenery-inspection/formats';
import { sha256Bytes, sha256Text } from './hash';
import type { ListedStorageObject } from './inventory';

export function make136StyleListing(): ListedStorageObject[] {
  const items: ListedStorageObject[] = [];
  for (let i = 0; i < 96; i += 1) {
    items.push({ key: `tivvlejoy-assets/receipts/meta-${String(i + 1).padStart(3, '0')}.json`, size: 1200 + i, etag: `etag-json-${i}` });
  }
  for (let i = 0; i < 36; i += 1) {
    const family = i === 0 ? 'mountain' : i === 1 ? 'tavern' : i === 2 ? 'village' : i === 3 ? 'forest' : i === 4 ? 'botaniq' : i === 5 ? 'gaffer' : 'pack';
    const size = family === 'botaniq' ? 4 * 1024 * 1024 * 1024 : family === 'mountain' ? 3 * 1024 * 1024 : 80 * 1024 * 1024;
    items.push({ key: `tivvlejoy-assets/source/${family}/archive-${i}.zip`, size, etag: `etag-zip-${i}` });
  }
  items.push({ key: 'tivvlejoy-assets/source/mountain/hero.glb', size: 48_000, etag: 'etag-glb' });
  items.push({ key: 'tivvlejoy-assets/source/tavern/interior.fbx', size: 22_000, etag: 'etag-fbx' });
  items.push({ key: 'tivvlejoy-assets/source/tavern/interior.blend', size: 4096, etag: 'etag-blend' });
  items.push({ key: 'tivvlejoy-assets/source/sky/extra.gz', size: 800, etag: 'etag-gz-1' });
  items.push({ key: 'tivvlejoy-assets/source/sky/extra-2.gz', size: 900, etag: 'etag-gz-2' });
  items.push({ key: 'tivvlejoy-assets/source/sky/extra-3.gz', size: 1000, etag: 'etag-gz-3' });
  return items;
}

export function make500SourceListing(): ListedStorageObject[] {
  return Array.from({ length: 500 }, (_, index) => ({
    key: `tivvlejoy-assets/source/scale/src-${index}.zip`,
    size: 1024 + index,
    etag: `etag-${index}`,
  }));
}

export function mountainGlbBytes(): Uint8Array {
  return buildMinimalGlb({
    scenes: [{}],
    nodes: [{ name: 'MountainHero' }, { name: 'Ridge' }],
    meshes: [{ name: 'MountainHero', primitives: [{ indices: 0 }] }],
    accessors: [{ count: 300 }],
    materials: [{ name: 'RockPaint' }],
    images: [{ uri: 'rock.png' }],
    extras: { description: 'hero mountain mesh' },
  });
}

export function tavernFbxBytes(): Uint8Array {
  const header = fbxBinaryHeader(7400);
  const ascii = new TextEncoder().encode('Model::TavernInterior\nModel::Chair\nModel::Table\nModel::Barrel\n');
  const out = new Uint8Array(header.byteLength + ascii.byteLength);
  out.set(header, 0);
  out.set(ascii, header.byteLength);
  return out;
}

export function blendHeaderOnly(): Uint8Array {
  return blendHeaderBytes('402');
}

export function tinyZipWithTraversal(): Uint8Array {
  const local = new Uint8Array(64);
  local.set([0x50, 0x4b, 0x03, 0x04], 0);
  return local;
}

export function objectBytesFor136(): Record<string, Uint8Array> {
  const glb = mountainGlbBytes();
  const fbx = tavernFbxBytes();
  const blend = blendHeaderOnly();
  return {
    [sha256Text('tivvlejoy-assets/source/mountain/hero.glb')]: glb,
    [sha256Text('tivvlejoy-assets/source/tavern/interior.fbx')]: fbx,
    [sha256Text('tivvlejoy-assets/source/tavern/interior.blend')]: blend,
  };
}

export function knownHashes() {
  return {
    glb: sha256Bytes(mountainGlbBytes()),
    fbx: sha256Bytes(tavernFbxBytes()),
    blend: sha256Bytes(blendHeaderOnly()),
  };
}

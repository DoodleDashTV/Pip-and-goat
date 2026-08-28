import { NextResponse } from 'next/server';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PREFIX = 'tivvlejoy-assets';

type SourceSpec = {
  sourceId: string;
  filename: string;
  collection: string;
  unityPreservationOnly: boolean;
};

type Item = { key: string; size: number };

const SOURCES: SourceSpec[] = [
  { sourceId: 'SRC_VILLAGE_BLEND_ZIP', filename: 'Village (Blender 4.2.2).zip', collection: 'Village', unityPreservationOnly: false },
  { sourceId: 'SRC_VILLAGE_TEXTURES_ZIP', filename: 'Village (Textures).zip', collection: 'Village', unityPreservationOnly: false },
  { sourceId: 'SRC_VILLAGE_PROJECT_ZIP', filename: 'Project File.zip', collection: 'Village', unityPreservationOnly: false },
  { sourceId: 'SRC_VILLAGE_FBX_ZIP', filename: 'Village (FBX).zip', collection: 'Village', unityPreservationOnly: false },
  { sourceId: 'SRC_VILLAGE_UNITY_BUILTIN', filename: 'Village - Built-in (Unity 2022.3.16f1).unitypackage.gz', collection: 'Village', unityPreservationOnly: true },
  { sourceId: 'SRC_VILLAGE_UNITY_URP', filename: 'Village - URP (Unity 2022.3.16f1).unitypackage.gz', collection: 'Village', unityPreservationOnly: true },
  { sourceId: 'SRC_VILLAGE_UNITY_HDRP', filename: 'Village - HDRP (Unity 2022.3.16f1).unitypackage.gz', collection: 'Village', unityPreservationOnly: true },
  { sourceId: 'SRC_SKY_MACHINE_V1_ZIP', filename: 'SkyMachineV1.zip', collection: 'Sky/HDRI', unityPreservationOnly: false },
  { sourceId: 'SRC_SKY_MACHINE_V2_ZIP', filename: 'SkyMachineV2.zip', collection: 'Sky/HDRI', unityPreservationOnly: false },
  { sourceId: 'SRC_SKY_EXTRA_UPDATE_ZIP', filename: 'Extra Update 1.zip', collection: 'Sky/HDRI', unityPreservationOnly: false },
  { sourceId: 'SRC_SKY_HDRI_JPG_PACK', filename: 'HDRi_JPG_Pack.zip', collection: 'Sky/HDRI', unityPreservationOnly: false },
  { sourceId: 'SRC_FOREST_MODEL_PACKAGE', filename: 'Stylized_Forest_Nature_Kit.zip', collection: 'Stylized Forest/EcoKit', unityPreservationOnly: false },
  { sourceId: 'SRC_FOREST_STYLISED_ECOKIT', filename: 'Stylised EcoKit.zip', collection: 'Stylized Forest/EcoKit', unityPreservationOnly: false },
  { sourceId: 'SRC_SKY_WORLD_SHADERS_GIVEAWAY', filename: 'Giveaway_World Shaders.zip', collection: 'World Shaders', unityPreservationOnly: false },
];

function clean(v: string | null | undefined) { return String(v || '').replace(/[\r\n]+/g, '').trim(); }
function norm(v: string) { return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function basename(key: string) { const parts = key.split('/'); return parts[parts.length - 1] || key; }
function keyIdentity(key: string) { return createHash('sha256').update(key).digest('hex'); }
function r2() {
  const endpoint = clean(process.env.R2_ENDPOINT || process.env.OBJECT_STORAGE_ENDPOINT);
  const region = clean(process.env.R2_REGION || process.env.OBJECT_STORAGE_REGION || 'auto');
  const bucket = clean(process.env.R2_BUCKET || process.env.OBJECT_STORAGE_BUCKET);
  const accessKeyId = clean(process.env.R2_ACCESS_KEY_ID || process.env.OBJECT_STORAGE_ACCESS_KEY_ID);
  const secretAccessKey = clean(process.env.R2_SECRET_ACCESS_KEY || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY);
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('PRIVATE_R2_NOT_CONFIGURED');
  return { bucket, client: new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } }) };
}
async function listObjects() {
  const c = r2(); const items: Item[] = []; let token: string | undefined;
  do {
    const page = await c.client.send(new ListObjectsV2Command({ Bucket: c.bucket, Prefix: PREFIX, MaxKeys: 1000, ContinuationToken: token }));
    for (const obj of page.Contents || []) {
      const key = clean(obj.Key); const size = Number(obj.Size || 0);
      if (key && size > 0) items.push({ key, size });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return items;
}
function candidateScore(item: Item, spec: SourceSpec) {
  const full = norm(item.key);
  const base = norm(basename(item.key));
  const filename = norm(spec.filename);
  const sourceId = norm(spec.sourceId);
  const directFilename = base === filename || base.endsWith(filename);
  const filenameContained = full.includes(filename);
  const sourceIdContained = full.includes(sourceId);
  if (!directFilename && !filenameContained && !sourceIdContained) return -Infinity;
  let score = 100;
  if (directFilename) score += 300;
  if (filenameContained) score += 160;
  if (sourceIdContained) score += 140;
  const lower = item.key.toLowerCase();
  if (lower.includes('/source/')) score += 220;
  if (lower.includes('/uploads/') || lower.includes('/original/')) score += 100;
  if (lower.includes('showcase-compat') || lower.includes('/archive-content/') || lower.includes('/derived/') || lower.includes('/normalized/')) score -= 220;
  // Prefer the smaller exact original when wrappers/expanded copies duplicate a source.
  score -= Math.min(100, Math.log2(Math.max(1, item.size / (1024 * 1024))) * 3);
  return score;
}

export async function GET() {
  try {
    const items = await listObjects();
    const selected: Array<SourceSpec & { size: number; objectIdentity: string; matchCount: number }> = [];
    const used = new Set<string>();
    const missing: string[] = [];
    for (const spec of SOURCES) {
      const ranked = items
        .map((item) => ({ item, score: candidateScore(item, spec) }))
        .filter((x) => Number.isFinite(x.score))
        .sort((a, b) => b.score - a.score || a.item.size - b.item.size);
      const choice = ranked.find((x) => !used.has(x.item.key));
      if (!choice) { missing.push(spec.sourceId); continue; }
      used.add(choice.item.key);
      selected.push({ ...spec, size: choice.item.size, objectIdentity: keyIdentity(choice.item.key), matchCount: ranked.length });
    }
    const totalBytes = selected.reduce((sum, x) => sum + x.size, 0);
    const renderable = selected.filter((x) => !x.unityPreservationOnly);
    const preservation = selected.filter((x) => x.unityPreservationOnly);
    const collections = Array.from(new Set(selected.map((x) => x.collection)));
    return NextResponse.json({
      schema: 'TIVVLEJOY_ORIGINAL_14_SOURCE_SELECTION_V1',
      ready: missing.length === 0 && selected.length === SOURCES.length,
      expectedSourceCount: SOURCES.length,
      selectedSourceCount: selected.length,
      missingSourceIds: missing,
      totalOriginalBytes: totalBytes,
      renderableSourceCount: renderable.length,
      renderableBytes: renderable.reduce((sum, x) => sum + x.size, 0),
      unityPreservationOnlyCount: preservation.length,
      unityPreservationOnlyBytes: preservation.reduce((sum, x) => sum + x.size, 0),
      collectionCount: collections.length,
      collections,
      sources: selected.map((x) => ({
        sourceId: x.sourceId,
        filename: x.filename,
        collection: x.collection,
        unityPreservationOnly: x.unityPreservationOnly,
        byteSize: x.size,
        objectIdentity: x.objectIdentity,
        candidateMatchCount: x.matchCount,
      })),
      privateObjectKeysPublished: false,
      commercialAssetsPublished: false,
      paidMutationPerformed: false,
    }, { status: missing.length ? 409 : 200 });
  } catch (e) {
    return NextResponse.json({ schema: 'TIVVLEJOY_ORIGINAL_14_SOURCE_SELECTION_V1', ready: false, error: clean((e as Error).message).slice(0, 240), paidMutationPerformed: false }, { status: 503 });
  }
}

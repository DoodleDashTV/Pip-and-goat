import { NextResponse } from 'next/server';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PREFIX = 'tivvlejoy-assets';
const HARD_INPUT_CAP = 5 * 1024 * 1024 * 1024;
const REQUIRED_ROLES = [
  'mountain_geometry', 'background_mountains', 'forest_geometry', 'forest_textures',
  'village_geometry', 'village_textures', 'tavern_geometry',
  'sky_hdri', 'sky_machine', 'world_shaders',
] as const;

type Role = (typeof REQUIRED_ROLES)[number];
type Item = { key: string; size: number };
type Rule = { include: RegExp[]; prefer?: RegExp[]; exclude?: RegExp[]; maxBytes?: number };

const RULES: Record<Role, Rule> = {
  mountain_geometry: { include: [/3dt.*mountain/i, /mountain.*pack/i, /mountains.*glb/i], prefer: [/\.glb$/i, /blender\.zip$/i, /fbx.*textures\.zip$/i], exclude: [/ue5/i, /background/i] },
  background_mountains: { include: [/louisbgmountains/i, /background.*mountain/i], prefer: [/\.zip$/i, /\.blend$/i, /\.fbx$/i] },
  forest_geometry: { include: [/stylized.*forest/i, /stylised.*ecokit/i, /forest.*nature.*kit/i, /ecokit/i], prefer: [/\.zip$/i, /\.blend$/i, /\.fbx$/i, /\.glb$/i], exclude: [/4096|2048|1024/i] },
  forest_textures: { include: [/4096/i, /forest.*texture/i, /rocks_[ab]/i, /foliage_0[12]/i], prefer: [/4096.*\.zip$/i, /\.zip$/i] },
  village_geometry: { include: [/village.*fbx/i, /village.*blender/i, /assembled.*project.*\.blend/i, /source\/village/i], prefer: [/village.*fbx.*\.zip$/i, /assembled.*\.blend$/i, /blender.*\.zip$/i], exclude: [/texture/i, /unity/i] },
  village_textures: { include: [/village.*texture/i], prefer: [/\.zip$/i] },
  tavern_geometry: { include: [/stylized.*tavern.*interior.*\.blend/i, /stylized.*tavern.*package.*\.fbx/i, /tavern/i], prefer: [/\.blend$/i, /\.fbx$/i, /\.blend\.zip$/i, /package\.zip$/i], exclude: [/texture/i] },
  sky_hdri: { include: [/(^|\/)sk1\.zip$/i, /hdri.*jpg.*pack/i, /sky.*hdri/i, /\.hdr$/i], prefer: [/sk1\.zip$/i, /\.hdr$/i, /hdri.*\.zip$/i] },
  sky_machine: { include: [/skymachinev2/i, /sky.*machine.*v2/i], prefer: [/skymachinev2\.zip$/i, /\.blend$/i] },
  world_shaders: { include: [/world.*shaders/i, /giveaway.*world/i, /physical[_ -]?starlight[_ -]?atmosphere-1\.9\.4/i, /gaffer 3\.2\.10/i], prefer: [/world.*shaders.*\.zip$/i, /physical.*1\.9\.4.*\.zip$/i, /gaffer 3\.2\.10.*\.zip$/i] },
};

function clean(v: string | null | undefined) { return String(v || '').replace(/[\r\n]+/g, '').trim(); }
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
    for (const obj of page.Contents || []) { const key = clean(obj.Key); const size = Number(obj.Size || 0); if (key && size > 0) items.push({ key, size }); }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return items;
}
function commercial(item: Item) {
  const k = item.key.toLowerCase();
  return k.startsWith(PREFIX) && !/\/characters\//.test(k) && !/\/executions\//.test(k) && !/\/qa\//.test(k) && !/receipt\.json$|status\.json$|manifest\.json$|\.part\b/.test(k);
}
function score(item: Item, rule: Rule) {
  if (rule.exclude?.some((rx) => rx.test(item.key))) return -Infinity;
  if (!rule.include.some((rx) => rx.test(item.key))) return -Infinity;
  if (item.size > Number(rule.maxBytes || 1500 * 1024 * 1024)) return -Infinity;
  let value = 100;
  for (let i = 0; i < (rule.prefer || []).length; i += 1) if (rule.prefer![i].test(item.key)) value += 80 - i * 8;
  if (/\.blend$/i.test(item.key)) value += 32;
  if (/\.glb$/i.test(item.key)) value += 30;
  if (/\.fbx$/i.test(item.key)) value += 28;
  if (/\.zip$/i.test(item.key)) value += 16;
  if (/wrapper|backup|historical|ue5/i.test(item.key)) value -= 60;
  value += Math.min(24, Math.log2(Math.max(1, item.size / (1024 * 1024))) * 2);
  return value;
}

export async function GET() {
  try {
    const items = await listObjects(); const candidates = items.filter(commercial); const used = new Set<string>();
    const selected: Array<{ role: Role; size: number }> = [];
    for (const role of REQUIRED_ROLES) {
      const ranked = candidates.map((item) => ({ item, value: score(item, RULES[role]) })).filter((x) => Number.isFinite(x.value)).sort((a, b) => b.value - a.value || a.item.size - b.item.size);
      const choice = ranked.find((x) => !used.has(x.item.key));
      if (!choice) return NextResponse.json({ schema: 'TIVVLEJOY_SCENERY_SELECTION_V4', ready: false, missingRole: role, selectedRoleCount: selected.length, listedObjectCount: items.length, commercialCandidateCount: candidates.length, paidMutationPerformed: false }, { status: 409 });
      used.add(choice.item.key); selected.push({ role, size: choice.item.size });
    }
    const selectedTotalBytes = selected.reduce((sum, x) => sum + x.size, 0);
    if (selectedTotalBytes > HARD_INPUT_CAP) return NextResponse.json({ schema: 'TIVVLEJOY_SCENERY_SELECTION_V4', ready: false, error: 'SCENERY_INPUT_CAP', selectedTotalBytes, hardInputCapBytes: HARD_INPUT_CAP, paidMutationPerformed: false }, { status: 409 });
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SELECTION_V4', ready: true,
      requiredRoleCount: REQUIRED_ROLES.length, selectedRoleCount: selected.length,
      selectedRoles: selected.map((x) => x.role), selectedBytesByRole: Object.fromEntries(selected.map((x) => [x.role, x.size])),
      selectedTotalBytes, hardInputCapBytes: HARD_INPUT_CAP,
      natureLibraryRequired: false, waterSystemRequired: false,
      purchasedSceneryOnly: true, listedObjectCount: items.length, commercialCandidateCount: candidates.length,
      paidMutationPerformed: false,
    });
  } catch (e) {
    return NextResponse.json({ schema: 'TIVVLEJOY_SCENERY_SELECTION_V4', ready: false, error: clean((e as Error).message).slice(0, 240), paidMutationPerformed: false }, { status: 503 });
  }
}

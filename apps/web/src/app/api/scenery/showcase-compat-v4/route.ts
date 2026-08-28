import { NextResponse } from 'next/server';
import { CopyObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PREFIX = 'tivvlejoy-assets';
const COMPAT_PREFIX = `${PREFIX}/showcase-compat`;
const NATURE_ALIAS = `${COMPAT_PREFIX}/assets library nature role.zip`;
const AUTH = 'TIVVLEJOY_SCENERY_SHOWCASE_30S_PAID_EXECUTION_AUTHORIZATION_V3';

const REQUIRED_ROLES = [
  'mountain_geometry', 'background_mountains', 'forest_geometry', 'forest_textures',
  'water_system', 'village_geometry', 'village_textures', 'tavern_geometry',
  'nature_library', 'sky_hdri', 'sky_machine', 'world_shaders',
] as const;

type Item = { key: string; size: number };
type Rule = { include: RegExp[]; prefer?: RegExp[]; exclude?: RegExp[]; maxBytes?: number };

const ROLE_RULES: Record<(typeof REQUIRED_ROLES)[number], Rule> = {
  mountain_geometry: { include: [/3dt.*mountain/i, /mountain.*pack/i, /mountains.*glb/i], prefer: [/\.glb$/i, /blender\.zip$/i, /fbx.*textures\.zip$/i], exclude: [/ue5/i, /background/i] },
  background_mountains: { include: [/louisbgmountains/i, /background.*mountain/i], prefer: [/\.zip$/i, /\.blend$/i, /\.fbx$/i] },
  forest_geometry: { include: [/stylized.*forest/i, /stylised.*ecokit/i, /forest.*nature.*kit/i, /ecokit/i], prefer: [/\.zip$/i, /\.blend$/i, /\.fbx$/i, /\.glb$/i], exclude: [/4096|2048|1024/i] },
  forest_textures: { include: [/4096/i, /forest.*texture/i, /rocks_[ab]/i, /foliage_0[12]/i], prefer: [/4096.*\.zip$/i, /\.zip$/i] },
  water_system: { include: [/water[_ -]?mat.*gn/i, /water.*\.blend$/i, /river.*\.blend$/i], prefer: [/water[_ -]?mat.*gn.*\.blend$/i, /\.blend$/i] },
  village_geometry: { include: [/village.*fbx/i, /village.*blender/i, /assembled.*project.*\.blend/i, /source\/village/i], prefer: [/village.*fbx.*\.zip$/i, /assembled.*\.blend$/i, /blender.*\.zip$/i], exclude: [/texture/i, /unity/i] },
  village_textures: { include: [/village.*texture/i], prefer: [/\.zip$/i] },
  tavern_geometry: { include: [/stylized.*tavern.*interior.*\.blend/i, /stylized.*tavern.*package.*\.fbx/i, /tavern/i], prefer: [/\.blend$/i, /\.fbx$/i, /\.blend\.zip$/i, /package\.zip$/i], exclude: [/texture/i] },
  nature_library: { include: [/procedural.*nature/i, /assets library/i, /flora/i, /rock[_ -]?model/i, /scatter/i, /botaniq_full-7\.2\.0/i], prefer: [/\.blend$/i, /assets library\.zip$/i, /\.zip$/i], exclude: [/geoscatter.*biomes/i], maxBytes: 900 * 1024 * 1024 },
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
  const ctx = r2(); const out: Item[] = []; let token: string | undefined;
  do {
    const page = await ctx.client.send(new ListObjectsV2Command({ Bucket: ctx.bucket, Prefix: PREFIX, MaxKeys: 1000, ContinuationToken: token }));
    for (const x of page.Contents || []) { const key = clean(x.Key); const size = Number(x.Size || 0); if (key && size > 0) out.push({ key, size }); }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}
function commercial(item: Item) {
  const k = item.key.toLowerCase();
  return k.startsWith(PREFIX) && !/\/characters\//.test(k) && !/\/executions\//.test(k) && !/\/qa\//.test(k) && !/receipt\.json$|status\.json$|manifest\.json$|\.part\b/.test(k);
}
function score(item: Item, rule: Rule) {
  const key = item.key;
  if (rule.exclude?.some((rx) => rx.test(key))) return -Infinity;
  if (!rule.include.some((rx) => rx.test(key))) return -Infinity;
  if (item.size > Number(rule.maxBytes || 1500 * 1024 * 1024)) return -Infinity;
  let value = 100;
  for (let i = 0; i < (rule.prefer || []).length; i += 1) if (rule.prefer![i].test(key)) value += 80 - i * 8;
  if (/\.blend$/i.test(key)) value += 32;
  if (/\.glb$/i.test(key)) value += 30;
  if (/\.fbx$/i.test(key)) value += 28;
  if (/\.zip$/i.test(key)) value += 16;
  if (/wrapper|backup|historical|ue5/i.test(key)) value -= 60;
  value += Math.min(24, Math.log2(Math.max(1, item.size / (1024 * 1024))) * 2);
  return value;
}
function workerEquivalentSelection(items: Item[]) {
  const candidates = items.filter(commercial); const used = new Set<string>(); const selected: Array<{ role: string; key: string; size: number }> = [];
  for (const role of REQUIRED_ROLES) {
    const rule = ROLE_RULES[role];
    const ranked = candidates.map((item) => ({ item, value: score(item, rule) })).filter((x) => Number.isFinite(x.value)).sort((a, b) => b.value - a.value || a.item.size - b.item.size);
    const choice = ranked.find((x) => !used.has(x.item.key));
    if (!choice) return { ok: false, missingRole: role, selected, listedObjectCount: items.length, commercialCandidateCount: candidates.length };
    used.add(choice.item.key); selected.push({ role, key: choice.item.key, size: choice.item.size });
  }
  return { ok: true, missingRole: null, selected, listedObjectCount: items.length, commercialCandidateCount: candidates.length };
}
function copySource(bucket: string, key: string) { return `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`; }
function sanitized(result: ReturnType<typeof workerEquivalentSelection>) {
  return { ok: result.ok, missingRole: result.missingRole, selectedRoles: result.selected.map((x) => x.role), selectedRoleCount: result.selected.length, listedObjectCount: result.listedObjectCount, commercialCandidateCount: result.commercialCandidateCount };
}

export async function GET() {
  try { return NextResponse.json({ schema: 'TIVVLEJOY_SCENERY_COMPAT_V4', ...(sanitized(workerEquivalentSelection(await listObjects()))), paidMutationPerformed: false }); }
  catch (e) { return NextResponse.json({ schema: 'TIVVLEJOY_SCENERY_COMPAT_V4', error: clean((e as Error).message), paidMutationPerformed: false }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    if (clean(request.headers.get('x-tivvlejoy-scenery-authorization')) !== AUTH) throw new Error('AUTH_REQUIRED');
    const before = await listObjects();
    let result = workerEquivalentSelection(before); let aliasCreated = false;
    if (!result.ok && result.missingRole === 'nature_library') {
      const ctx = r2();
      const existing = new Set(before.map((x) => x.key));
      if (!existing.has(NATURE_ALIAS)) {
        const nature = before.filter(commercial).filter((x) => !x.key.startsWith(`${COMPAT_PREFIX}/`)).map((item) => ({ item, value: score(item, ROLE_RULES.nature_library) })).filter((x) => Number.isFinite(x.value)).sort((a, b) => b.value - a.value || a.item.size - b.item.size)[0];
        if (!nature) throw new Error('NATURE_COMPAT_SOURCE_NOT_FOUND');
        await ctx.client.send(new CopyObjectCommand({ Bucket: ctx.bucket, Key: NATURE_ALIAS, CopySource: copySource(ctx.bucket, nature.item.key) }));
        aliasCreated = true;
      }
      result = workerEquivalentSelection(await listObjects());
    }
    if (!result.ok) throw new Error(`WORKER_EQUIVALENT_SELECTION_FAILED:${result.missingRole}`);
    return NextResponse.json({ schema: 'TIVVLEJOY_SCENERY_COMPAT_V4', ready: true, aliasCreated, natureAliasPrivate: true, sourceBytesModified: false, ...sanitized(result), paidMutationPerformed: false });
  } catch (e) {
    return NextResponse.json({ schema: 'TIVVLEJOY_SCENERY_COMPAT_V4', ready: false, error: clean((e as Error).message).slice(0, 240), paidMutationPerformed: false }, { status: 400 });
  }
}

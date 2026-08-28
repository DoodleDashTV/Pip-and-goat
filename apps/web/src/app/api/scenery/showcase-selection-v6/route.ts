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
type Rule = { include?: string[]; any?: string[]; exclude?: string[] };

const RULES: Record<Role, Rule> = {
  mountain_geometry: { include: ['3dt', 'mountain'], any: ['mountain pack', 'mountains.glb'], exclude: ['ue5', 'background'] },
  background_mountains: { any: ['louisbgmountains', 'background mountain', 'background_mountain', 'background-mountain'] },
  forest_geometry: { any: ['stylized forest', 'stylized_forest', 'stylised ecokit', 'stylised_ecokit', 'forest nature kit', 'forest_nature_kit', 'ecokit'], exclude: ['4096', '2048', '1024'] },
  forest_textures: { any: ['4096', 'forest texture', 'forest_texture', 'rocks_a', 'rocks_b', 'foliage_01', 'foliage_02'] },
  village_geometry: { any: ['village (fbx)', 'village_fbx', 'village (blender', 'village_blender', 'assembled project', '/source/village'], exclude: ['texture', 'unity'] },
  village_textures: { any: ['village (textures)', 'village texture', 'village_texture'] },
  tavern_geometry: { any: ['stylized tavern', 'stylized_tavern', 'tavern'], exclude: ['texture'] },
  sky_hdri: { any: ['/sk1.zip', 'sk1.zip', 'hdri_jpg_pack', 'hdri jpg pack', 'sky hdri', '.hdr'] },
  sky_machine: { any: ['skymachinev2', 'sky machine v2', 'sky_machine_v2'] },
  world_shaders: { any: ['world shaders', 'world_shaders', 'giveaway_world', 'giveaway world', 'physical starlight atmosphere', 'gaffer 3.2.10'] },
};

function clean(v: string | null | undefined) { return String(v || '').replace(/[\r\n]+/g, '').trim(); }
function lower(v: unknown) { return String(v || '').toLowerCase(); }
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
  const k = lower(item.key);
  return k.startsWith(PREFIX) && !k.includes('/characters/') && !k.includes('/executions/') && !k.includes('/qa/') && !k.endsWith('receipt.json') && !k.endsWith('status.json') && !k.endsWith('manifest.json') && !k.includes('.part');
}
function matchesRule(key: string, rule: Rule) {
  const k = lower(key);
  if ((rule.exclude || []).some((x) => k.includes(x))) return false;
  if (rule.include && !rule.include.every((x) => k.includes(x))) {
    if (!(rule.any || []).some((x) => k.includes(x))) return false;
  }
  if (!rule.include && !(rule.any || []).some((x) => k.includes(x))) return false;
  return true;
}
function score(item: Item, rule: Rule) {
  const key = lower(item.key);
  if (!matchesRule(key, rule)) return -Infinity;
  if (item.size <= 0 || item.size > 1500 * 1024 * 1024) return -Infinity;
  let value = 100;
  if (key.includes('/source/')) value += 180;
  if (key.includes('showcase-compat') || key.includes('wrapper') || key.includes('backup') || key.includes('historical') || key.includes('ue5')) value -= 90;
  if (key.endsWith('.blend')) value += 32;
  if (key.endsWith('.glb')) value += 30;
  if (key.endsWith('.fbx')) value += 28;
  if (key.endsWith('.zip')) value += 16;
  const sizeMb = Math.max(1, item.size / (1024 * 1024));
  value -= Math.min(110, Math.log2(sizeMb) * 8);
  return value;
}

export async function GET() {
  try {
    const items = await listObjects(); const candidates = items.filter(commercial); const used = new Set<string>();
    const selected: Array<{ role: Role; size: number; source: boolean; compatibility: boolean }> = [];
    for (const role of REQUIRED_ROLES) {
      const ranked = candidates.map((item) => ({ item, value: score(item, RULES[role]) })).filter((x) => Number.isFinite(x.value)).sort((a, b) => b.value - a.value || a.item.size - b.item.size);
      const choice = ranked.find((x) => !used.has(x.item.key));
      if (!choice) return NextResponse.json({ schema: 'TIVVLEJOY_SCENERY_SELECTION_V6', ready: false, missingRole: role, selectedRoleCount: selected.length, listedObjectCount: items.length, commercialCandidateCount: candidates.length, sourceFirstSelection: true, paidMutationPerformed: false }, { status: 409 });
      used.add(choice.item.key);
      const k = lower(choice.item.key);
      selected.push({ role, size: choice.item.size, source: k.includes('/source/'), compatibility: k.includes('showcase-compat') });
    }
    const selectedTotalBytes = selected.reduce((sum, x) => sum + x.size, 0);
    if (selectedTotalBytes > HARD_INPUT_CAP) return NextResponse.json({ schema: 'TIVVLEJOY_SCENERY_SELECTION_V6', ready: false, error: 'SCENERY_INPUT_CAP', selectedTotalBytes, hardInputCapBytes: HARD_INPUT_CAP, sourceFirstSelection: true, paidMutationPerformed: false }, { status: 409 });
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SELECTION_V6', ready: true,
      requiredRoleCount: REQUIRED_ROLES.length, selectedRoleCount: selected.length,
      selectedRoles: selected.map((x) => x.role), selectedBytesByRole: Object.fromEntries(selected.map((x) => [x.role, x.size])),
      selectedTotalBytes, hardInputCapBytes: HARD_INPUT_CAP,
      selectedSourceObjectCount: selected.filter((x) => x.source).length,
      selectedCompatibilityObjectCount: selected.filter((x) => x.compatibility).length,
      natureLibraryRequired: false, waterSystemRequired: false,
      purchasedSceneryOnly: true, sourceFirstSelection: true,
      listedObjectCount: items.length, commercialCandidateCount: candidates.length,
      privateObjectKeysPublished: false, paidMutationPerformed: false,
    });
  } catch (e) {
    return NextResponse.json({ schema: 'TIVVLEJOY_SCENERY_SELECTION_V6', ready: false, error: clean((e as Error).message).slice(0, 240), sourceFirstSelection: true, paidMutationPerformed: false }, { status: 503 });
  }
}

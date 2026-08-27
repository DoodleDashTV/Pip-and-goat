import { createHash, timingSafeEqual } from 'node:crypto';
import { createConfiguredMultipartStorage } from '@/lib/scenery/intake/r2-multipart';
import type { MultipartStoragePort } from '@/lib/scenery/intake/multipart';
import { validateRigControlMapping, type AdapterCharacterId, type RigControlMapping } from './tivvlejoy-rig-control-adapter';

export const TIVVLEJOY_RIG_ADAPTER_RECEIPT_SCHEMA = 'TIVVLEJOY_RIG_CONTROL_ADAPTER_RECEIPT_V1' as const;
export const TIVVLEJOY_RIG_ADAPTER_TOKEN_HEADER = 'x-tivvlejoy-character-intake-token' as const;

type Action = 'status' | 'save' | 'receipt';

function expectedToken(env: Record<string, string | undefined>) {
  return String(env.TIVVLEJOY_CHARACTER_INTAKE_TOKEN ?? '').trim();
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function authorized(value: string, env: Record<string, string | undefined>) {
  const expected = expectedToken(env);
  return Boolean(expected && value && safeEqual(expected, value));
}

function assertPreview(env: Record<string, string | undefined>) {
  if (env.VERCEL_ENV !== 'preview') throw new Error('RIG_ADAPTER_RECEIPT_PREVIEW_REQUIRED');
}

function assertCharacter(value: unknown): AdapterCharacterId {
  if (value === 'CHAR_PIP_001' || value === 'CHAR_GOAT_001') return value;
  throw new Error('RIG_ADAPTER_RECEIPT_CHARACTER_INVALID');
}

function receiptKey(characterId: AdapterCharacterId, rigVersionId: string) {
  return `tivvlejoy-assets/characters/${characterId}/rig-deliveries/${rigVersionId}/adapter/receipt.json`;
}

async function readJson<T>(storage: MultipartStoragePort, key: string): Promise<T | null> {
  const bytes = await storage.getObject?.(key);
  if (!bytes) return null;
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')) as T; }
  catch { throw new Error('RIG_ADAPTER_RECEIPT_CORRUPT'); }
}

async function writeJson(storage: MultipartStoragePort, key: string, value: unknown) {
  if (!storage.putObject) throw new Error('RIG_ADAPTER_RECEIPT_STORAGE_WRITE_UNAVAILABLE');
  await storage.putObject(key, new TextEncoder().encode(JSON.stringify(value)), 'application/json');
}

export function publicRigAdapterReceiptStatus(env: Record<string, string | undefined> = process.env) {
  return {
    schemaVersion: TIVVLEJOY_RIG_ADAPTER_RECEIPT_SCHEMA,
    previewRuntime: env.VERCEL_ENV === 'preview',
    tokenConfigured: Boolean(expectedToken(env)),
    persistedAdapters: 0,
    humanApproved: false as const,
    productionEnabled: false as const,
  };
}

export async function handleRigAdapterReceipt(input: {
  action: Action;
  body?: Record<string, unknown>;
  token?: string;
  env?: Record<string, string | undefined>;
  storage?: MultipartStoragePort;
}) {
  const env = input.env ?? process.env;
  if (input.action === 'status') return { status: 200, body: publicRigAdapterReceiptStatus(env) };
  assertPreview(env);
  if (!authorized(input.token ?? '', env)) throw new Error('RIG_ADAPTER_RECEIPT_UNAUTHORIZED');
  const storage = input.storage ?? await createConfiguredMultipartStorage(env);
  const body = input.body ?? {};
  const characterId = assertCharacter(body.characterId);
  const rigVersionId = String(body.rigVersionId ?? '').trim();
  if (!/^[a-f0-9-]{36}$/i.test(rigVersionId)) throw new Error('RIG_ADAPTER_RECEIPT_VERSION_INVALID');
  const key = receiptKey(characterId, rigVersionId);

  if (input.action === 'receipt') {
    const receipt = await readJson<Record<string, unknown>>(storage, key);
    return receipt ? { status: 200, body: receipt } : { status: 404, body: { receiptFound: false, characterId, rigVersionId, humanApproved: false, productionEnabled: false } };
  }

  if (input.action === 'save') {
    const mapping = body.mapping as RigControlMapping | undefined;
    if (!mapping || mapping.characterId !== characterId || mapping.rigVersionId !== rigVersionId) throw new Error('RIG_ADAPTER_RECEIPT_MAPPING_BINDING_INVALID');
    const validated = validateRigControlMapping(mapping);
    if (!validated.valid) throw new Error('RIG_ADAPTER_RECEIPT_MAPPING_INVALID');
    const existing = await readJson<Record<string, unknown>>(storage, key);
    if (existing) {
      const existingAdapterSha = String(existing.adapterSha256 ?? '');
      if (existingAdapterSha === validated.adapterSha256) return { status: 200, body: { ...existing, idempotent: true } };
      throw new Error('RIG_ADAPTER_RECEIPT_IMMUTABLE_CONFLICT');
    }
    const receiptBody = {
      schemaVersion: TIVVLEJOY_RIG_ADAPTER_RECEIPT_SCHEMA,
      characterId,
      rigVersionId,
      rigSourceSha256: validated.normalized.rigSourceSha256,
      adapterSha256: validated.adapterSha256,
      normalizedMapping: validated.normalized,
      requiredControlCount: validated.requiredControlCount,
      mappedControlCount: validated.mappedControlCount,
      storedAt: new Date().toISOString(),
      immutable: true,
      structurallyValid: true,
      technicalInspectionPassed: false,
      humanApproved: false,
      productionEnabled: false,
    };
    const receiptSha256 = createHash('sha256').update(JSON.stringify(receiptBody)).digest('hex');
    const receipt = { ...receiptBody, receiptSha256 };
    await writeJson(storage, key, receipt);
    return { status: 200, body: { ...receipt, idempotent: false } };
  }

  throw new Error('RIG_ADAPTER_RECEIPT_ACTION_INVALID');
}

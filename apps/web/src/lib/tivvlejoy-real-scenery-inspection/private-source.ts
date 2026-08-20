import { createConfiguredMultipartStorage } from '@/lib/scenery/intake/r2-multipart';
import { describeSceneryStorageConfiguration, resolveSceneryAssetPrefix } from '@/lib/scenery/intake/config';
import { sha256Text } from './hash';

export type PrivateSourceAccess = {
  configured: boolean;
  durable: boolean;
  realPrivateSourceAccessAvailable: false | true;
  blocker: string | null;
  credentialsPrinted: false;
  r2Mutated: false;
};

export type PrivateSourceProbe = PrivateSourceAccess & {
  listingExecuted: boolean;
  objectCount: number;
  totalBytes: number;
  extensionCounts: Record<string, number>;
  hashedObjectIdentities: string[];
  commercialBytesDownloaded: 0;
  commercialBytesDeletedFromStore: false;
};

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/g,
  /rpa_[A-Za-z0-9]+/g,
  /X-Amz-[A-Za-z0-9-]+=[^&\s]+/g,
];

function sanitizeBlocker(message: string): string {
  let next = message;
  for (const pattern of SECRET_PATTERNS) next = next.replace(pattern, '[REDACTED]');
  next = next.replace(/https?:\/\/[^\s]+/g, '[REDACTED_URL]');
  next = next.replace(/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+\.(zip|blend|fbx|glb|scatpack|paq)/gi, '[REDACTED_KEY]');
  return next.slice(0, 240);
}

function extensionOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx).toLowerCase() : '';
}

export function describePrivateSourceAccess(
  env: Record<string, string | undefined> = process.env,
): PrivateSourceAccess {
  const config = describeSceneryStorageConfiguration(env);
  if (!config.configured) {
    return {
      configured: false,
      durable: false,
      realPrivateSourceAccessAvailable: false,
      blocker: 'PRIVATE_SOURCE_CREDENTIALS_OR_REACHABILITY_UNPROVEN',
      credentialsPrinted: false,
      r2Mutated: false,
    };
  }
  return {
    configured: true,
    durable: config.durable,
    realPrivateSourceAccessAvailable: false,
    blocker:
      'PRIVATE_SOURCE_LISTING_NOT_EXECUTED_IN_DEFAULT_PATH: reachability is unproven and commercial bytes stay unread until an explicit read-only materializer call succeeds.',
    credentialsPrinted: false,
    r2Mutated: false,
  };
}

export async function probePrivateSourceCatalog(input?: {
  env?: Record<string, string | undefined>;
  listPrefix?: (prefix: string) => Promise<Array<{ key: string; size: number }>>;
}): Promise<PrivateSourceProbe> {
  const env = input?.env ?? process.env;
  const baseline = describePrivateSourceAccess(env);
  const empty = (blocker: string, extras: Partial<PrivateSourceProbe> = {}): PrivateSourceProbe => ({
    ...baseline,
    realPrivateSourceAccessAvailable: false,
    listingExecuted: false,
    objectCount: 0,
    totalBytes: 0,
    extensionCounts: {},
    hashedObjectIdentities: [],
    commercialBytesDownloaded: 0,
    commercialBytesDeletedFromStore: false,
    blocker,
    credentialsPrinted: false,
    r2Mutated: false,
    ...extras,
  });
  if (!baseline.configured) {
    return empty(baseline.blocker ?? 'PRIVATE_SOURCE_CREDENTIALS_OR_REACHABILITY_UNPROVEN');
  }
  try {
    const prefix = resolveSceneryAssetPrefix(env);
    const storage = input?.listPrefix ? null : await createConfiguredMultipartStorage(env);
    const listPrefix = input?.listPrefix ?? storage?.listPrefix?.bind(storage);
    if (!listPrefix) {
      return empty('PRIVATE_SOURCE_LIST_UNSUPPORTED: storage port has no read-only listPrefix.');
    }
    const items = await listPrefix(prefix);
    const extensionCounts: Record<string, number> = {};
    const hashedObjectIdentities: string[] = [];
    let totalBytes = 0;
    for (const item of items) {
      totalBytes += item.size;
      const ext = extensionOf(item.key) || '(none)';
      extensionCounts[ext] = (extensionCounts[ext] ?? 0) + 1;
      hashedObjectIdentities.push(sha256Text(item.key));
    }
    return {
      configured: true,
      durable: baseline.durable,
      realPrivateSourceAccessAvailable: true,
      listingExecuted: true,
      objectCount: items.length,
      totalBytes,
      extensionCounts,
      hashedObjectIdentities,
      commercialBytesDownloaded: 0,
      commercialBytesDeletedFromStore: false,
      blocker: null,
      credentialsPrinted: false,
      r2Mutated: false,
    };
  } catch (error) {
    return empty(
      `PRIVATE_SOURCE_LISTING_FAILED: ${sanitizeBlocker(error instanceof Error ? error.message : 'unknown')}`,
      { listingExecuted: true },
    );
  }
}

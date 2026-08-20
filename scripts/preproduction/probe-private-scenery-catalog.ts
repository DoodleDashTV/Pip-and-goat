/**
 * Read-only private scenery catalog probe.
 * Lists object identities only. Does not download commercial bytes.
 */
import { createHash } from 'node:crypto';
import {
  ConnectionReadyMultipartStorage,
  createConfiguredMultipartStorage,
  describeSceneryStorageConfiguration,
} from '../../apps/web/src/lib/scenery/intake';

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function extensionOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx).toLowerCase() : '(none)';
}

function sanitize(message: string): string {
  return message
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]')
    .replace(/rpa_[A-Za-z0-9]+/g, '[REDACTED]')
    .replace(/X-Amz-[A-Za-z0-9-]+=[^&\s]+/g, '[REDACTED]')
    .replace(/https?:\/\/[^\s]+/g, '[REDACTED_URL]')
    .replace(/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+\.(zip|blend|fbx|glb|scatpack|paq)/gi, '[REDACTED_KEY]')
    .slice(0, 240);
}

function print(payload: Record<string, unknown>): void {
  const text = JSON.stringify(payload, null, 2);
  if (/AKIA[0-9A-Z]{16}|rpa_[A-Za-z0-9]+|X-Amz-|Signature=/i.test(text)) {
    throw new Error('probe output failed secret scan');
  }
  console.log(text);
}

async function main(): Promise<void> {
  const config = describeSceneryStorageConfiguration();
  if (!config.configured) {
    print({
      configured: false,
      durable: config.durable,
      realPrivateSourceAccessAvailable: false,
      listingExecuted: false,
      objectCount: 0,
      totalBytes: 0,
      extensionCounts: {},
      hashedObjectCount: 0,
      commercialBytesDownloaded: 0,
      r2Mutated: false,
      credentialsPrinted: false,
      blocker: 'PRIVATE_SOURCE_CREDENTIALS_OR_REACHABILITY_UNPROVEN',
    });
    return;
  }

  try {
    const storage = await createConfiguredMultipartStorage();
    if (storage instanceof ConnectionReadyMultipartStorage) {
      print({
        configured: true,
        durable: config.durable,
        realPrivateSourceAccessAvailable: false,
        listingExecuted: false,
        objectCount: 0,
        totalBytes: 0,
        extensionCounts: {},
        hashedObjectCount: 0,
        commercialBytesDownloaded: 0,
        r2Mutated: false,
        credentialsPrinted: false,
        blocker:
          'PRIVATE_SOURCE_LIST_USED_CONNECTION_READY_STUB: credentials may be present, but this process did not obtain a durable R2 client. Commercial bytes were not listed or read.',
      });
      return;
    }
    if (!storage.listPrefix) {
      print({
        configured: true,
        durable: config.durable,
        realPrivateSourceAccessAvailable: false,
        listingExecuted: false,
        objectCount: 0,
        totalBytes: 0,
        extensionCounts: {},
        hashedObjectCount: 0,
        commercialBytesDownloaded: 0,
        r2Mutated: false,
        credentialsPrinted: false,
        blocker: 'PRIVATE_SOURCE_LIST_UNSUPPORTED: storage port has no read-only listPrefix.',
      });
      return;
    }
    const items = await storage.listPrefix(config.prefix);
    const extensionCounts: Record<string, number> = {};
    let totalBytes = 0;
    for (const item of items) {
      totalBytes += item.size;
      const ext = extensionOf(item.key);
      extensionCounts[ext] = (extensionCounts[ext] ?? 0) + 1;
    }
    print({
      configured: true,
      durable: config.durable,
      realPrivateSourceAccessAvailable: true,
      listingExecuted: true,
      objectCount: items.length,
      totalBytes,
      extensionCounts,
      hashedObjectCount: items.map((item) => sha256Text(item.key)).length,
      commercialBytesDownloaded: 0,
      r2Mutated: false,
      credentialsPrinted: false,
      blocker: null,
    });
  } catch (error) {
    print({
      configured: true,
      durable: config.durable,
      realPrivateSourceAccessAvailable: false,
      listingExecuted: true,
      objectCount: 0,
      totalBytes: 0,
      extensionCounts: {},
      hashedObjectCount: 0,
      commercialBytesDownloaded: 0,
      r2Mutated: false,
      credentialsPrinted: false,
      blocker: `PRIVATE_SOURCE_LISTING_FAILED: ${sanitize(error instanceof Error ? error.message : 'unknown')}`,
    });
  }
}

void main();

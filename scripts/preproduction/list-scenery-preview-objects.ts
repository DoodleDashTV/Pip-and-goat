/**
 * Lists Preview scenery keys and sizes only. Never prints credentials.
 */
import { createConfiguredMultipartStorage } from '../../apps/web/src/lib/scenery/intake/r2-multipart';
import { describeSceneryStorageConfiguration } from '../../apps/web/src/lib/scenery/intake/config';

async function main() {
  const config = describeSceneryStorageConfiguration(process.env);
  if (!config.configured) {
    console.log(JSON.stringify({ listed: false, reason: config.state }));
    return;
  }
  const storage = await createConfiguredMultipartStorage(process.env);
  if (!storage.listPrefix) {
    console.log(JSON.stringify({ listed: false, reason: 'listPrefix unavailable' }));
    return;
  }
  const items = await storage.listPrefix(`${config.prefix}/`);
  const source = items.filter((item) => item.key.includes('/source/'));
  const manifests = items.filter((item) => item.key.includes('/intake-manifests/'));
  console.log(
    JSON.stringify(
      {
        listed: true,
        prefix: config.prefix,
        sourceCount: source.length,
        manifestCount: manifests.length,
        source: source.map((item) => ({
          name: item.key.split('/').pop(),
          collection: item.key.split('/')[2] ?? null,
          size: item.size,
        })),
        manifests: manifests.map((item) => item.key.split('/').pop()),
      },
      null,
      2,
    ),
  );
}

void main();

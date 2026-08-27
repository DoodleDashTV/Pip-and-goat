import { GetBucketCorsCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { SceneryError } from './scenery/types';
import {
  browserUploadCorsRule,
  corsRuleSatisfiesBrowserUpload,
  createR2MultipartStorage,
  ensureBrowserUploadCorsPolicy,
  mergeBrowserUploadCorsRules,
  resolveConfiguredBrowserUploadOrigin,
  sceneryUploadCorsConfiguration,
} from './scenery/intake/r2-multipart';

const STABLE_ORIGIN = 'https://tivvlejoy-preview-example.vercel.app';

const EXISTING_SCENERY_RULE = {
  ID: 'scenery-preview-existing',
  AllowedOrigins: ['https://pip-and-goat-git-cursor-tivvlejoy-example.vercel.app'],
  AllowedMethods: ['PUT', 'GET'],
  AllowedHeaders: ['content-type'],
  ExposeHeaders: ['ETag'],
  MaxAgeSeconds: 600,
};

describe('browser upload CORS origin validation', () => {
  it('accepts only the exact https Vercel origin with no path or trailing slash', () => {
    expect(
      resolveConfiguredBrowserUploadOrigin({ TIVVLEJOY_SCENERY_CORS_ORIGIN: STABLE_ORIGIN }),
    ).toBe(STABLE_ORIGIN);
    expect(
      resolveConfiguredBrowserUploadOrigin({
        TIVVLEJOY_SCENERY_CORS_ORIGIN: `${STABLE_ORIGIN}/`,
      }),
    ).toBeNull();
    expect(
      resolveConfiguredBrowserUploadOrigin({
        TIVVLEJOY_SCENERY_CORS_ORIGIN: `${STABLE_ORIGIN}/character-rigging`,
      }),
    ).toBeNull();
    expect(
      resolveConfiguredBrowserUploadOrigin({
        TIVVLEJOY_SCENERY_CORS_ORIGIN: STABLE_ORIGIN.replace('https://', 'http://'),
      }),
    ).toBeNull();
    expect(
      resolveConfiguredBrowserUploadOrigin({
        TIVVLEJOY_SCENERY_CORS_ORIGIN: 'https://example.com',
      }),
    ).toBeNull();
    expect(resolveConfiguredBrowserUploadOrigin({})).toBeNull();
  });
});

describe('browser upload CORS merge', () => {
  it('requires PUT, wildcard allowed headers, and ETag exposure for the exact origin', () => {
    const required = browserUploadCorsRule(STABLE_ORIGIN);
    expect(required).toEqual({
      AllowedOrigins: [STABLE_ORIGIN],
      AllowedMethods: ['PUT'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    });
    expect(sceneryUploadCorsConfiguration(STABLE_ORIGIN)).toEqual({ CORSRules: [required] });
    expect(corsRuleSatisfiesBrowserUpload(required, STABLE_ORIGIN)).toBe(true);
    expect(
      corsRuleSatisfiesBrowserUpload(
        { ...required, AllowedOrigins: ['https://other.vercel.app'] },
        STABLE_ORIGIN,
      ),
    ).toBe(false);
    expect(corsRuleSatisfiesBrowserUpload({ ...required, AllowedMethods: ['GET'] }, STABLE_ORIGIN)).toBe(
      false,
    );
    expect(
      corsRuleSatisfiesBrowserUpload({ ...required, AllowedHeaders: ['content-type'] }, STABLE_ORIGIN),
    ).toBe(false);
    expect(corsRuleSatisfiesBrowserUpload({ ...required, ExposeHeaders: [] }, STABLE_ORIGIN)).toBe(
      false,
    );
  });

  it('preserves existing scenery rules and appends the required Preview origin rule', () => {
    const merged = mergeBrowserUploadCorsRules([EXISTING_SCENERY_RULE], STABLE_ORIGIN);
    expect(merged.changed).toBe(true);
    expect(merged.CORSRules).toHaveLength(2);
    expect(merged.CORSRules[0]).toEqual(EXISTING_SCENERY_RULE);
    expect(merged.CORSRules[1]).toEqual(browserUploadCorsRule(STABLE_ORIGIN));
    expect(merged.CORSRules[1]?.AllowedMethods).toContain('PUT');
    expect(merged.CORSRules[1]?.AllowedHeaders).toContain('*');
    expect(merged.CORSRules[1]?.ExposeHeaders).toContain('ETag');
  });

  it('does not rewrite CORS when the required rule is already present', () => {
    const existing = [EXISTING_SCENERY_RULE, browserUploadCorsRule(STABLE_ORIGIN)];
    const merged = mergeBrowserUploadCorsRules(existing, STABLE_ORIGIN);
    expect(merged.changed).toBe(false);
    expect(merged.CORSRules).toEqual(existing);
  });
});

describe('ensureBrowserUploadCorsPolicy', () => {
  it('puts only when the required rule is absent', async () => {
    const puts: unknown[] = [];
    const first = await ensureBrowserUploadCorsPolicy({
      origin: STABLE_ORIGIN,
      async getRules() {
        return [EXISTING_SCENERY_RULE];
      },
      async putRules(rules) {
        puts.push(rules);
      },
    });
    expect(first.updated).toBe(true);
    expect(puts).toHaveLength(1);
    expect(puts[0]).toEqual([EXISTING_SCENERY_RULE, browserUploadCorsRule(STABLE_ORIGIN)]);

    const second = await ensureBrowserUploadCorsPolicy({
      origin: STABLE_ORIGIN,
      async getRules() {
        return [EXISTING_SCENERY_RULE, browserUploadCorsRule(STABLE_ORIGIN)];
      },
      async putRules(rules) {
        puts.push(rules);
      },
    });
    expect(second.updated).toBe(false);
    expect(puts).toHaveLength(1);
  });

  it('treats a missing bucket CORS configuration as empty and merges the required rule', async () => {
    const puts: unknown[] = [];
    const result = await ensureBrowserUploadCorsPolicy({
      origin: STABLE_ORIGIN,
      async getRules() {
        const error = new Error('missing');
        Object.assign(error, { name: 'NoSuchCORSConfiguration' });
        throw error;
      },
      async putRules(rules) {
        puts.push(rules);
      },
    });
    expect(result.updated).toBe(true);
    expect(puts).toEqual([[browserUploadCorsRule(STABLE_ORIGIN)]]);
  });

  it('fails closed when GetBucketCors is denied', async () => {
    await expect(
      ensureBrowserUploadCorsPolicy({
        origin: STABLE_ORIGIN,
        async getRules() {
          throw new Error('AccessDenied');
        },
        async putRules() {
          throw new Error('should not put');
        },
      }),
    ).rejects.toMatchObject({
      code: 'R2_CORS_CONFIGURATION_FAILED',
    } satisfies Partial<SceneryError>);
  });
});

describe('resumed sign-part CORS enforcement', () => {
  it('runs ensureBrowserUploadCors before signPart and does not rewrite on the next part', async () => {
    const commands: string[] = [];
    let storedRules: Array<typeof EXISTING_SCENERY_RULE | ReturnType<typeof browserUploadCorsRule>> = [
      EXISTING_SCENERY_RULE,
    ];
    const storage = createR2MultipartStorage({
      bucket: 'private-bucket',
      corsOrigin: STABLE_ORIGIN,
      async signPartUrl() {
        return 'https://example.invalid/signed-part';
      },
      client: {
        async send(command: unknown) {
          if (command instanceof GetBucketCorsCommand) {
            commands.push('GetBucketCors');
            return { CORSRules: storedRules };
          }
          if (command instanceof PutBucketCorsCommand) {
            commands.push('PutBucketCors');
            storedRules = (command.input.CORSConfiguration?.CORSRules ?? []) as typeof storedRules;
            return {};
          }
          commands.push((command as { constructor?: { name?: string } })?.constructor?.name ?? 'unknown');
          return {};
        },
      },
    });

    const signed = await storage.signPart({
      key: 'tivvlejoy-assets/characters/CHAR_GOAT_001/source/Goat_FINN.zip',
      uploadId: 'existing-upload',
      partNumber: 1,
      ttlSeconds: 60,
    });
    expect(signed.url).toBe('https://example.invalid/signed-part');
    expect(commands).toEqual(['GetBucketCors', 'PutBucketCors']);
    expect(storedRules).toEqual([EXISTING_SCENERY_RULE, browserUploadCorsRule(STABLE_ORIGIN)]);

    await storage.signPart({
      key: 'tivvlejoy-assets/characters/CHAR_GOAT_001/source/Goat_FINN.zip',
      uploadId: 'existing-upload',
      partNumber: 2,
      ttlSeconds: 60,
    });
    expect(commands).toEqual(['GetBucketCors', 'PutBucketCors']);
  });
});

import { NextResponse } from 'next/server';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PREFIX = 'tivvlejoy-assets';
const TERMS = /(water|river|creek|forest|texture|ecokit|nature)/i;

function clean(value: string | null | undefined) {
  return String(value || '').replace(/[\r\n]+/g, '').trim();
}

function config() {
  const endpoint = clean(process.env.R2_ENDPOINT || process.env.OBJECT_STORAGE_ENDPOINT);
  const region = clean(process.env.R2_REGION || process.env.OBJECT_STORAGE_REGION || 'auto');
  const bucket = clean(process.env.R2_BUCKET || process.env.OBJECT_STORAGE_BUCKET);
  const accessKeyId = clean(process.env.R2_ACCESS_KEY_ID || process.env.OBJECT_STORAGE_ACCESS_KEY_ID);
  const secretAccessKey = clean(process.env.R2_SECRET_ACCESS_KEY || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY);
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('PRIVATE_R2_NOT_CONFIGURED');
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

function commercialCandidate(key: string) {
  const lower = key.toLowerCase();
  if (!lower.startsWith(PREFIX)) return false;
  if (/\/characters\//.test(lower) || /\/executions\//.test(lower) || /\/qa\//.test(lower)) return false;
  if (/receipt\.json$|status\.json$|manifest\.json$|\.part\b/.test(lower)) return false;
  return true;
}

export async function GET() {
  try {
    const { client, bucket } = config();
    const matches: Array<{ key: string; size: number }> = [];
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        MaxKeys: 1000,
        ContinuationToken: token,
      }));
      for (const item of page.Contents || []) {
        const key = clean(item.Key);
        const size = Number(item.Size || 0);
        if (key && size > 0 && commercialCandidate(key) && TERMS.test(key)) {
          matches.push({ key, size });
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_ROLE_DIAGNOSTIC_V1',
      matchCount: matches.length,
      matches: matches.slice(0, 100),
      commercialAssetBytesReturned: 0,
      credentialsReturned: false,
      paidMutationPerformed: false,
    });
  } catch (error) {
    return NextResponse.json({
      schema: 'TIVVLEJOY_SCENERY_SHOWCASE_ROLE_DIAGNOSTIC_V1',
      error: clean((error as Error).message).slice(0, 160),
      paidMutationPerformed: false,
    }, { status: 503 });
  }
}

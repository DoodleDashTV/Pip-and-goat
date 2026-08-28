import { NextResponse } from 'next/server';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PREFIX = 'tivvlejoy-assets';
const COMPAT_PREFIX = `${PREFIX}/showcase-compat/`;
const INCLUDE = [/procedural.*nature/i, /assets library/i, /flora/i, /rock[_ -]?model/i, /scatter/i, /botaniq_full-7\.2\.0/i];
const EXCLUDE = [/geoscatter.*biomes/i];
const MAX = 900 * 1024 * 1024;

function clean(v: string | null | undefined) { return String(v || '').replace(/[\r\n]+/g, '').trim(); }
function ctx() {
  const endpoint=clean(process.env.R2_ENDPOINT||process.env.OBJECT_STORAGE_ENDPOINT);
  const region=clean(process.env.R2_REGION||process.env.OBJECT_STORAGE_REGION||'auto');
  const bucket=clean(process.env.R2_BUCKET||process.env.OBJECT_STORAGE_BUCKET);
  const accessKeyId=clean(process.env.R2_ACCESS_KEY_ID||process.env.OBJECT_STORAGE_ACCESS_KEY_ID);
  const secretAccessKey=clean(process.env.R2_SECRET_ACCESS_KEY||process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY);
  if(!endpoint||!bucket||!accessKeyId||!secretAccessKey) throw new Error('PRIVATE_R2_NOT_CONFIGURED');
  return {bucket,client:new S3Client({endpoint,region,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}})};
}
function commercial(key:string){const k=key.toLowerCase();return k.startsWith(PREFIX)&&!/\/characters\//.test(k)&&!/\/executions\//.test(k)&&!/\/qa\//.test(k)&&!/receipt\.json$|status\.json$|manifest\.json$|\.part\b/.test(k);}
function id(key:string){return createHash('sha256').update(key).digest('hex').slice(0,16);}

export async function GET(){
  try{
    const c=ctx(); const rows:Array<{key:string,size:number}>=[]; let token:string|undefined;
    do{
      const p=await c.client.send(new ListObjectsV2Command({Bucket:c.bucket,Prefix:PREFIX,MaxKeys:1000,ContinuationToken:token}));
      for(const x of p.Contents||[]){const key=clean(x.Key);const size=Number(x.Size||0);if(key&&size>0&&commercial(key))rows.push({key,size});}
      token=p.IsTruncated?p.NextContinuationToken:undefined;
    }while(token);
    const matched=rows.filter(x=>INCLUDE.some(rx=>rx.test(x.key)));
    const diag=matched.map(x=>({
      id:id(x.key),
      bytes:x.size,
      compat:x.key.startsWith(COMPAT_PREFIX),
      excluded:EXCLUDE.some(rx=>rx.test(x.key)),
      oversize:x.size>MAX,
      workerEligible:!EXCLUDE.some(rx=>rx.test(x.key))&&x.size<=MAX,
    }));
    return NextResponse.json({
      schema:'TIVVLEJOY_SCENERY_NATURE_DIAGNOSTIC_V4',
      commercialCandidateCount:rows.length,
      oldPreflightNatureMatchCount:matched.length,
      workerEligibleNatureCount:diag.filter(x=>x.workerEligible).length,
      nonCompatWorkerEligibleNatureCount:diag.filter(x=>x.workerEligible&&!x.compat).length,
      excludedNatureCount:diag.filter(x=>x.excluded).length,
      oversizeNatureCount:diag.filter(x=>x.oversize).length,
      compatNatureCount:diag.filter(x=>x.compat).length,
      candidates:diag,
      paidMutationPerformed:false,
    });
  }catch(e){return NextResponse.json({schema:'TIVVLEJOY_SCENERY_NATURE_DIAGNOSTIC_V4',error:clean((e as Error).message),paidMutationPerformed:false},{status:503});}
}

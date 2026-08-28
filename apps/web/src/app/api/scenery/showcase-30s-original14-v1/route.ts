import { NextResponse } from 'next/server';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const EXECUTION_ID = 'scenery-showcase-original14-30s-v1-20260828';
const POD_NAME = 'tivvlejoy-scenery-original14-30s-v1';
const AUTHORIZATION = 'TIVVLEJOY_SCENERY_ORIGINAL14_30S_STANDING_AUTHORIZATION_V1';
const TEMPLATE_ID = 'u4glgdj076';
const TEMPLATE_NAME = 'TivvleJoy Scenery Original14 30s V1';
const WORKER_IMAGE_DIGEST = 'sha256:7dfedd6ba367e8f881aae6430f0f1a61dd78a033dc77d4ca712c1e20c8bd30f4';
const WORKER_IMAGE_PLACEHOLDER = `ghcr.io/<ghcr-owner>/ddp-runpod-blender@${WORKER_IMAGE_DIGEST}`;
function imageMatchesPin(imageName: string) {
  const image = clean(imageName);
  return image.endsWith(`@${WORKER_IMAGE_DIGEST}`) || image.endsWith(WORKER_IMAGE_DIGEST);
}
const OUTPUT_KEY = `tivvlejoy-assets/showcases/${EXECUTION_ID}/tivvlejoy-scenery-original14-30s.mp4`;
const STATUS_KEY = `jobs/${EXECUTION_ID}/status.json`;
const STARTUP_KEY = `jobs/${EXECUTION_ID}/startup-status.json`;
const MAX_HOURLY_USD = 0.8;
const HARD_COST_USD = 2.0;
const MAX_RUNTIME_MINUTES = 75;
const STARTUP_WATCHDOG_MINUTES = 25;
const HARD_INPUT_CAP_BYTES = 4 * 1024 * 1024 * 1024;

function clean(v: string | null | undefined) { return String(v || '').replace(/[\r\n]+/g, '').trim(); }
function r2Config() {
  const endpoint=clean(process.env.R2_ENDPOINT || process.env.OBJECT_STORAGE_ENDPOINT);
  const region=clean(process.env.R2_REGION || process.env.OBJECT_STORAGE_REGION || 'auto');
  const bucket=clean(process.env.R2_BUCKET || process.env.OBJECT_STORAGE_BUCKET);
  const accessKeyId=clean(process.env.R2_ACCESS_KEY_ID || process.env.OBJECT_STORAGE_ACCESS_KEY_ID);
  const secretAccessKey=clean(process.env.R2_SECRET_ACCESS_KEY || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY);
  if(!endpoint||!bucket||!accessKeyId||!secretAccessKey) throw new Error('PRIVATE_R2_NOT_CONFIGURED');
  return {endpoint,region,bucket,accessKeyId,secretAccessKey,client:new S3Client({endpoint,region,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}})};
}
async function readJson(key:string){
  try { const r2=r2Config(); const result=await r2.client.send(new GetObjectCommand({Bucket:r2.bucket,Key:key})); const text=await result.Body?.transformToString(); return text?JSON.parse(text):null; }
  catch(error:any){ const status=error?.$metadata?.httpStatusCode; if(status===404||error?.name==='NoSuchKey'||error?.Code==='NoSuchKey') return null; throw error; }
}
async function listPrivateObjectCount(){
  const r2=r2Config(); let token:string|undefined; let count=0;
  do { const page=await r2.client.send(new ListObjectsV2Command({Bucket:r2.bucket,Prefix:'tivvlejoy-assets',MaxKeys:1000,ContinuationToken:token})); count+=(page.Contents||[]).filter((x)=>clean(x.Key)&&Number(x.Size||0)>0).length; token=page.IsTruncated?page.NextContinuationToken:undefined; } while(token);
  return count;
}
async function runpodRest(key:string,path:string,init:RequestInit={}){
  const res=await fetch(`https://rest.runpod.io${path}`,{...init,headers:{Authorization:`Bearer ${key}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})},cache:'no-store'});
  const text=await res.text().catch(()=> ''); let parsed:any=null; try{parsed=text?JSON.parse(text):null;}catch{}
  return {ok:res.ok,status:res.status,parsed};
}
async function runpodGraphql(key:string,query:string){
  const res=await fetch('https://api.runpod.io/graphql',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`,'User-Agent':'TivvleJoyOriginal14Bridge/1.0'},body:JSON.stringify({query}),cache:'no-store'});
  const parsed=await res.json().catch(()=>({})); if(!res.ok||parsed?.errors?.length) throw new Error('RUNPOD_GRAPHQL_REQUEST_FAILED'); return parsed.data||{};
}
function requireAuthorization(request:Request){
  if(clean(request.headers.get('x-tivvlejoy-scenery-authorization'))!==AUTHORIZATION) throw new Error('ORIGINAL14_STANDING_AUTHORIZATION_REQUIRED');
  const key=clean(request.headers.get('x-tivvlejoy-runpod-key')); if(!key) throw new Error('RUNPOD_KEY_REQUIRED'); return key;
}
async function exactAssetPreflight(request:Request){
  const url=new URL('/api/scenery/original-14-selection-v1',request.url);
  const res=await fetch(url,{method:'GET',cache:'no-store'}); const p=await res.json().catch(()=>({}));
  if(!res.ok||p?.ready!==true||p?.paidMutationPerformed!==false) throw new Error('ORIGINAL14_SELECTION_NOT_READY');
  if(Number(p?.expectedSourceCount)!==14||Number(p?.selectedSourceCount)!==14||Array.isArray(p?.missingSourceIds)&&p.missingSourceIds.length!==0) throw new Error('ORIGINAL14_SOURCE_COUNT_FAILED');
  if(Number(p?.renderableSourceCount)!==11||Number(p?.unityPreservationOnlyCount)!==3||Number(p?.collectionCount)!==4) throw new Error('ORIGINAL14_RENDERABILITY_CONTRACT_FAILED');
  if(p?.commercialAssetsPublished!==false||p?.privateObjectKeysPublished!==false) throw new Error('ORIGINAL14_PRIVACY_CONTRACT_FAILED');
  const total=Number(p?.totalOriginalBytes); if(!Number.isFinite(total)||total<=0||total>HARD_INPUT_CAP_BYTES) throw new Error('ORIGINAL14_INPUT_CAP_FAILED');
  return p;
}
async function verifyTemplate(key:string){
  const got=await runpodRest(key,'/v1/templates',{method:'GET'}); if(!got.ok) throw new Error(`RUNPOD_TEMPLATE_LIST_FAILED:${got.status}`);
  const items=Array.isArray(got.parsed)?got.parsed:Array.isArray(got.parsed?.templates)?got.parsed.templates:[];
  const exact=items.filter((x:any)=>clean(x?.id)===TEMPLATE_ID); if(exact.length!==1) throw new Error('ORIGINAL14_TEMPLATE_ID_NOT_UNIQUE');
  const t=exact[0]; if(clean(t?.name)!==TEMPLATE_NAME) throw new Error('ORIGINAL14_TEMPLATE_NAME_MISMATCH'); if(!imageMatchesPin(clean(t?.imageName))) throw new Error('ORIGINAL14_TEMPLATE_IMAGE_MISMATCH');
  return {templateId:TEMPLATE_ID,templateName:TEMPLATE_NAME,imageName:clean(t.imageName),workerImageDigest:WORKER_IMAGE_DIGEST};
}
async function secure4090Preflight(key:string){
  const data=await runpodGraphql(key,'query { myself { id } gpuTypes { id displayName lowestPrice(input: { gpuCount: 1, secureCloud: true }) { uninterruptablePrice stockStatus } } }');
  if(!data?.myself?.id) throw new Error('RUNPOD_AUTH_FAILED');
  const gpu=(data.gpuTypes||[]).find((g:any)=>String(g?.displayName||g?.id||'').toLowerCase().includes('4090')); if(!gpu) throw new Error('RTX_4090_NOT_FOUND');
  const rate=Number(gpu?.lowestPrice?.uninterruptablePrice); if(!Number.isFinite(rate)||rate<=0||rate>MAX_HOURLY_USD) throw new Error('SECURE_PRICE_INVALID');
  return {gpuTypeId:'NVIDIA GeForce RTX 4090',rate,stockStatus:gpu?.lowestPrice?.stockStatus||null};
}
function normalizePods(parsed:any){ if(Array.isArray(parsed)) return parsed; if(Array.isArray(parsed?.pods)) return parsed.pods; return []; }
async function listPods(key:string){ const got=await runpodRest(key,'/v1/pods',{method:'GET'}); if(!got.ok) throw new Error(`RUNPOD_POD_LIST_FAILED:${got.status}`); return normalizePods(got.parsed); }
function podIsActive(p:any){ const state=clean(p?.desiredStatus||p?.status||p?.podStatus).toUpperCase(); return !['TERMINATED','EXITED','STOPPED'].includes(state); }
function sanitizePod(p:any){ return {id:clean(p?.id)||null,name:clean(p?.name)||null,desiredStatus:clean(p?.desiredStatus||p?.status||p?.podStatus)||null,costPerHr:Number(p?.costPerHr??p?.costPerHour??p?.machine?.costPerHr??0)||null,machineId:clean(p?.machineId||p?.machine?.id)||null,runtime:p?.runtime?{uptimeInSeconds:Number(p.runtime?.uptimeInSeconds??0)||null,portsCount:Array.isArray(p.runtime?.ports)?p.runtime.ports.length:null}:null}; }
async function preflightAll(request:Request,key:string){
  const [assets,template,gpu,pods,objectCount]=await Promise.all([exactAssetPreflight(request),verifyTemplate(key),secure4090Preflight(key),listPods(key),listPrivateObjectCount()]);
  const active=pods.filter(podIsActive);
  return {assets,template,gpu,activePodCount:active.length,listedObjectCount:objectCount};
}

export async function GET(request:Request){
  try{
    const url=new URL(request.url); const [startup,status]=await Promise.all([readJson(STARTUP_KEY),readJson(STATUS_KEY)]); let downloadUrl:string|null=null;
    if(status?.status==='COMPLETE'&&url.searchParams.get('download')==='1'){ const r2=r2Config(); downloadUrl=await getSignedUrl(r2.client,new GetObjectCommand({Bucket:r2.bucket,Key:OUTPUT_KEY}),{expiresIn:900}); }
    return NextResponse.json({schema:'TIVVLEJOY_SCENERY_ORIGINAL14_30S_BRIDGE_V1',executionId:EXECUTION_ID,podName:POD_NAME,templateId:TEMPLATE_ID,workerImage:WORKER_IMAGE_PLACEHOLDER,workerImageDigest:WORKER_IMAGE_DIGEST,workerImagePinned:true,workerEntrypoint:'scenery-showcase-original14-entry.js',launchTransport:'RUNPOD_REST_TEMPLATE',originalSourceCount:14,renderableSourceCount:11,unityPreservationOnlyCount:3,collectionCount:4,internalResolution:'540x960',output:{resolution:'1080x1920',fps:30,frames:900,durationSeconds:30},samples:12,startupWatchdogMinutes:STARTUP_WATCHDOG_MINUTES,startup,status,downloadUrl,paidMutationPerformed:false});
  }catch(error){ return NextResponse.json({schema:'TIVVLEJOY_SCENERY_ORIGINAL14_30S_BRIDGE_V1',error:clean((error as Error).message).slice(0,240)||'STATUS_FAILED',paidMutationPerformed:false},{status:503}); }
}

export async function POST(request:Request){
  let createEntered=false;
  try{
    const key=requireAuthorization(request); const body=await request.json().catch(()=>({})); const action=clean(body?.action||'preflight');
    if(action==='preflight'){
      const c=await preflightAll(request,key);
      return NextResponse.json({schema:'TIVVLEJOY_SCENERY_ORIGINAL14_30S_PREFLIGHT_V1',ready:true,assets:c.assets,template:c.template,runpod:c.gpu,activePodCount:c.activePodCount,createBlocked:c.activePodCount>0,listedObjectCount:c.listedObjectCount,workerImage:c.template.imageName,workerImageDigest:WORKER_IMAGE_DIGEST,workerImagePinned:true,workerEntrypoint:'scenery-showcase-original14-entry.js',launchTransport:'RUNPOD_REST_TEMPLATE',originalSourceCount:14,renderableSourceCount:11,unityPreservationOnlyCount:3,collectionCount:4,internalResolution:'540x960',finalResolution:'1080x1920',samples:12,limits:{hardCostUsd:HARD_COST_USD,maxRuntimeMinutes:MAX_RUNTIME_MINUTES,maxHourlyUsd:MAX_HOURLY_USD,maxCreates:1,hardInputCapBytes:HARD_INPUT_CAP_BYTES},paidMutationPerformed:false});
    }
    if(action==='pod-status'){
      const pods=await listPods(key); const exact=pods.filter((p:any)=>clean(p?.name)===POD_NAME&&podIsActive(p)); return NextResponse.json({schema:'TIVVLEJOY_SCENERY_ORIGINAL14_POD_STATUS_V1',exactActiveCount:exact.length,exact:exact.map(sanitizePod),paidMutationPerformed:false});
    }
    if(action==='cleanup'){
      const before=await listPods(key); const exact=before.filter((p:any)=>clean(p?.name)===POD_NAME&&podIsActive(p)); let terminatedCount=0;
      for(const pod of exact){ const id=clean(pod?.id); if(!id) continue; const deleted=await runpodRest(key,`/v1/pods/${encodeURIComponent(id)}`,{method:'DELETE'}); if(![200,204,404].includes(deleted.status)) throw new Error(`POD_DELETE_FAILED:${deleted.status}`); terminatedCount+=1; }
      const after=await listPods(key); const remaining=after.filter((p:any)=>clean(p?.name)===POD_NAME&&podIsActive(p)); return NextResponse.json({schema:'TIVVLEJOY_SCENERY_ORIGINAL14_CLEANUP_V1',matchedBefore:exact.length,terminatedCount,remainingActiveExactName:remaining.length,billingCleanupConfirmed:remaining.length===0,createPerformed:false});
    }
    if(action!=='launch') throw new Error('UNKNOWN_ACTION');
    const c=await preflightAll(request,key);
    if(c.activePodCount>0) throw new Error('ACTIVE_RUNPOD_POD_PRESENT');
    const r2=r2Config();
    const env:Record<string,string>={
      R2_ENDPOINT:r2.endpoint,R2_REGION:r2.region,R2_BUCKET:r2.bucket,R2_ACCESS_KEY_ID:r2.accessKeyId,R2_SECRET_ACCESS_KEY:r2.secretAccessKey,
      OBJECT_STORAGE_PROVIDER:'r2',CLOUD_RENDER_ENABLED:'true',PAID_EXECUTION_AUTHORIZED:'true',SCENERY_SHOWCASE_EXECUTION_MODE:'live',TIVVLEJOY_SCENERY_ASSET_PREFIX:'tivvlejoy-assets',
      RENDER_JOB_ID:EXECUTION_ID,RENDER_WORKER_ID:`tivvlejoy-${EXECUTION_ID}`,RUNPOD_GPU_HOURLY_RATE:String(c.gpu.rate),SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES:String(MAX_RUNTIME_MINUTES),
      SCENERY_SHOWCASE_MAX_INPUT_BYTES:String(HARD_INPUT_CAP_BYTES),SCENERY_SHOWCASE_INTERNAL_RESOLUTION:'540x960',SCENERY_SHOWCASE_FINAL_RESOLUTION:'1080x1920',SCENERY_SHOWCASE_EEVEE_SAMPLES:'12',SCENERY_SHOWCASE_BLENDER_TIMEOUT_MINUTES:'55',
      R2_CONNECT_TIMEOUT_MS:'10000',R2_REQUEST_TIMEOUT_MS:'180000',R2_MAX_ATTEMPTS:'3',
    };
    if(Object.values(env).some((v)=>!v)) throw new Error('POD_ENV_INCOMPLETE');
    createEntered=true;
    const created=await runpodRest(key,'/v1/pods',{method:'POST',body:JSON.stringify({name:POD_NAME,cloudType:'SECURE',computeType:'GPU',gpuTypeIds:['NVIDIA GeForce RTX 4090'],gpuTypePriority:'custom',gpuCount:1,interruptible:false,locked:false,templateId:TEMPLATE_ID,ports:[],env})});
    if(!created.ok) throw new Error(`RUNPOD_REST_CREATE_FAILED:${created.status}`); const podId=clean(created.parsed?.id); if(!podId) throw new Error('RUNPOD_REST_CREATE_RETURNED_NO_ID');
    return NextResponse.json({schema:'TIVVLEJOY_SCENERY_ORIGINAL14_30S_LAUNCH_V1',executionId:EXECUTION_ID,podId,podName:POD_NAME,createEntered:true,createRequests:1,retryCreate:false,templateId:TEMPLATE_ID,launchTransport:'RUNPOD_REST_TEMPLATE',runpod:{secureUsdPerHr:c.gpu.rate,stockStatus:c.gpu.stockStatus},workerImage:c.template.imageName,workerImageDigest:WORKER_IMAGE_DIGEST,workerEntrypoint:'scenery-showcase-original14-entry.js',originalSourceCount:14,renderableSourceCount:11,unityPreservationOnlyCount:3,internalResolution:'540x960',finalResolution:'1080x1920',samples:12,limits:{hardCostUsd:HARD_COST_USD,maxRuntimeMinutes:MAX_RUNTIME_MINUTES,maxHourlyUsd:MAX_HOURLY_USD,hardInputCapBytes:HARD_INPUT_CAP_BYTES}});
  }catch(error){ return NextResponse.json({schema:'TIVVLEJOY_SCENERY_ORIGINAL14_30S_LAUNCH_V1',error:clean((error as Error).message).slice(0,280)||'ORIGINAL14_BRIDGE_FAILED',createEntered,retryCreate:false},{status:400}); }
}

#!/usr/bin/env node
'use strict';

/** TivvleJoy Original-14 purchased-scenery render worker. */
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

const r2 = require('./r2-client');
const core = require('./render-core');
const { resolveHeadlessGlConfig, applyHeadlessGlEnv } = require('./headless-gl');
const { REQUIRED_ROLES, selectAssets, selectExtraAssets } = require('./scenery-showcase-original14-roles');
const { resolveProfile, ffmpegEncodeArgs, ffmpegHasUpscale } = require('./scenery-render-profiles');
const contract = require('./final-launch-contract-v1');
const checkpoint = require('./frame-checkpoint-v1');

function strip(v) { return String(v || '').replace(/[\r\n]+/g, '').trim(); }
function log(event, detail = {}) { console.log(JSON.stringify({ ts:new Date().toISOString(), event, ...detail })); }
function safeName(sourceId, ordinal, key) {
  const ext = path.extname(String(key || '')).slice(0, 16);
  return `${String(ordinal + 1).padStart(2,'0')}-${sourceId.replace(/[^A-Za-z0-9_-]/g,'_')}${ext}`;
}
function sha256File(filePath) {
  const h=createHash('sha256'); const fd=fs.openSync(filePath,'r'); const buf=Buffer.allocUnsafe(4*1024*1024);
  try { for (;;) { const n=fs.readSync(fd,buf,0,buf.length,null); if(!n) break; h.update(buf.subarray(0,n)); } }
  finally { fs.closeSync(fd); }
  return h.digest('hex');
}
async function listAll(ctx,prefix) {
  const out=[]; let token;
  do {
    const page=await ctx.client.send(new ListObjectsV2Command({Bucket:ctx.bucket,Prefix:prefix,ContinuationToken:token,MaxKeys:1000}));
    for (const item of page.Contents||[]) { const key=String(item.Key||''); const size=Number(item.Size||0); if(key&&size>0) out.push({key,size,etag:item.ETag||null}); }
    token=page.IsTruncated?page.NextContinuationToken:undefined;
  } while(token);
  return out;
}
function readTail(filePath, bytes=8000) {
  try { const stat=fs.statSync(filePath); const start=Math.max(0,stat.size-bytes); const fd=fs.openSync(filePath,'r'); const b=Buffer.alloc(stat.size-start); fs.readSync(fd,b,0,b.length,start); fs.closeSync(fd); return b.toString('utf8'); }
  catch { return ''; }
}
function countPngFrames(outputDir) {
  try { return fs.readdirSync(outputDir).filter((name)=>/^frame_\d+\.png$/i.test(name)).length; }
  catch { return 0; }
}
function readProgressFile(progressPath) {
  try { return JSON.parse(fs.readFileSync(progressPath,'utf8')); }
  catch { return null; }
}
function runBlender({env,args,timeoutMs,logPath,onTick}) {
  return new Promise((resolve)=>{
    const fd=fs.openSync(logPath,'a');
    const child=spawn(env.BLENDER_BIN||'blender',args,{env,stdio:['ignore',fd,fd]});
    let settled=false;
    const safeTick=()=>{ Promise.resolve(onTick && onTick()).catch((error)=>log('blender_progress_tick_error',{message:String(error.message||error).slice(0,200)})); };
    safeTick();
    const tick=setInterval(safeTick,15000);
    const killer=setTimeout(()=>{
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(()=>{ try { child.kill('SIGKILL'); } catch {} },8000);
    },timeoutMs);
    const finish=(result)=>{
      if(settled) return;
      settled=true;
      clearInterval(tick);
      clearTimeout(killer);
      try { fs.closeSync(fd); } catch {}
      resolve(result);
    };
    child.on('error',(error)=>finish({status:null,error}));
    child.on('close',(status,signal)=>{
      if(signal==='SIGTERM'||signal==='SIGKILL') {
        finish({status,error:Object.assign(new Error('blender ETIMEDOUT'),{code:'ETIMEDOUT'})});
        return;
      }
      finish({status,error:null});
    });
  });
}
function measureVram() {
  const res = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 15_000 });
  if (res.status !== 0) return { gpuModel: null, vramMiB: 0 };
  const parts = String(res.stdout || '').trim().split('\n')[0].split(',').map((p) => p.trim());
  return { gpuModel: parts[0] || null, vramMiB: Number(parts[1]) || 0 };
}
function measureDiskFree(dir) {
  if (typeof fs.statfsSync === 'function') {
    const stat = fs.statfsSync(dir);
    return Number(stat.bavail) * Number(stat.bsize);
  }
  return 0;
}
function requiredFileReceipts(paths) {
  return paths.map((filePath) => {
    const exists = fs.existsSync(filePath);
    const bytes = exists && fs.statSync(filePath).isFile() ? fs.statSync(filePath).size : null;
    return { name: path.basename(filePath), exists, bytes };
  });
}
function runFfmpeg({inputDir,fps,outputPath,profile}) {
  const args=ffmpegEncodeArgs({
    fps,
    inputPattern:path.join(inputDir,'frame_%04d.png'),
    outputPath,
    profile,
  });
  if (profile && profile.id === 'FINAL' && ffmpegHasUpscale(args)) {
    throw Object.assign(new Error('FINAL encode must not Lanczos-upscale'),{code:'FINAL_UPSCALE_FORBIDDEN'});
  }
  return spawnSync('ffmpeg',args,{encoding:'utf8',maxBuffer:8*1024*1024});
}

async function main() {
  const env=process.env;
  const jobId=strip(env.RENDER_JOB_ID);
  if(!jobId) throw Object.assign(new Error('RENDER_JOB_ID required'),{code:'NO_JOB_ID'});
  if(strip(env.SCENERY_SHOWCASE_EXECUTION_MODE).toLowerCase()!=='live') throw Object.assign(new Error('live mode required'),{code:'SCENERY_LIVE_MODE_NOT_AUTHORIZED'});
  if(strip(env.PAID_EXECUTION_AUTHORIZED).toLowerCase()!=='true') throw Object.assign(new Error('paid authorization required'),{code:'PAID_EXECUTION_NOT_AUTHORIZED'});
  if(strip(env.CLOUD_RENDER_ENABLED).toLowerCase()!=='true') throw Object.assign(new Error('cloud render disabled'),{code:'CLOUD_RENDER_DISABLED'});

  const ctx=r2.createR2Client(env);
  const prefix=strip(env.TIVVLEJOY_SCENERY_ASSET_PREFIX||'tivvlejoy-assets').replace(/^\/+|\/+$/g,'');
  const workspace=path.join(env.RENDER_WORKSPACE_DIR||path.join(os.tmpdir(),'tivvlejoy-original14-showcase'),jobId);
  const assetsDir=path.join(workspace,'assets'); const outputDir=path.join(workspace,'output');
  const proofPath=path.join(outputDir,'original14-usage.json'); const blenderLog=path.join(workspace,'blender.log');
  await fsp.mkdir(assetsDir,{recursive:true}); await fsp.mkdir(outputDir,{recursive:true});

  const statusKey=`jobs/${jobId}/status.json`; const startupKey=`jobs/${jobId}/startup-status.json`;
  const outputPrefix=`tivvlejoy-assets/showcases/${jobId}`;
  const outputKey=`${outputPrefix}/tivvlejoy-scenery-original14-30s.mp4`;
  const proofKey=`${outputPrefix}/original14-usage.json`; const selectionKey=`${outputPrefix}/original14-selection-proof.json`;
  const writeJson=async(key,value)=>r2.uploadBuffer(ctx,key,Buffer.from(`${JSON.stringify(value,null,2)}\n`),'application/json');

  let stage='ORIGINAL_14_DISCOVERY';
  try {
    await writeJson(startupKey,{schema:'TIVVLEJOY_ORIGINAL14_STARTUP_V1',jobId,result:'RUNNING',stage,at:new Date().toISOString()});
    const listed=await listAll(ctx,prefix);
    const maxInput=Number(env.SCENERY_SHOWCASE_MAX_INPUT_BYTES||4*1024*1024*1024);
    const selection=selectAssets(listed,{maxInputBytes:maxInput});
    if(selection.originalSourceCount!==14||selection.renderableSourceCount!==11||selection.unityPreservationOnlyCount!==3||selection.collectionCount!==4) {
      throw Object.assign(new Error('Original-14 source-count contract failed'),{code:'ORIGINAL_14_COUNT_CONTRACT_FAILED'});
    }
    stage='ORIGINAL_14_SELECTION_COMPLETE';
    await writeJson(startupKey,{schema:'TIVVLEJOY_ORIGINAL14_STARTUP_V1',jobId,result:'RUNNING',stage,originalSourceCount:14,totalBytes:selection.totalBytes,at:new Date().toISOString()});
    log('original14_selected',{originalSourceCount:14,renderableSourceCount:11,unityPreservationOnlyCount:3,totalBytes:selection.totalBytes});

    stage='MATERIALIZE_ORIGINAL_14';
    const localAssets=[];
    const privateProof={
      schema:'TIVVLEJOY_ORIGINAL14_PRIVATE_SELECTION_V1',jobId,originalSourceCount:14,
      renderableSourceCount:11,unityPreservationOnlyCount:3,collectionCount:4,totalBytes:selection.totalBytes,
      sources:[],rawCommercialBytesPublished:false,publicSignedUrlsCreated:false,credentialsEmitted:false,
    };
    for (const [i,asset] of selection.selected.entries()) {
      await writeJson(startupKey,{schema:'TIVVLEJOY_ORIGINAL14_STARTUP_V1',jobId,result:'RUNNING',stage,index:i+1,total:14,sourceId:asset.sourceId,at:new Date().toISOString()});
      const dest=path.join(assetsDir,safeName(asset.sourceId,i,asset.key));
      await r2.downloadToFile(ctx,asset.key,dest);
      const observed=fs.statSync(dest).size;
      if(observed!==Number(asset.size)) throw Object.assign(new Error(`Downloaded size mismatch: ${asset.sourceId}`),{code:'ORIGINAL_14_SIZE_MISMATCH'});
      const digest=sha256File(dest);
      const objectIdentity=createHash('sha256').update(asset.key).digest('hex');
      localAssets.push({role:asset.role,sourceId:asset.sourceId,collection:asset.collection,unityPreservationOnly:asset.unityPreservationOnly,localPath:dest,sha256:digest,byteSize:observed});
      privateProof.sources.push({role:asset.role,sourceId:asset.sourceId,collection:asset.collection,unityPreservationOnly:asset.unityPreservationOnly,objectIdentity,sha256:digest,byteSize:observed});
      log('original14_materialized',{index:i+1,total:14,sourceId:asset.sourceId,byteSize:observed,sha256:digest});
    }
    await writeJson(selectionKey,privateProof);

    stage='MATERIALIZE_PURCHASED_EXTRAS';
    const extras=selectExtraAssets(listed,new Set(selection.selected.map((x)=>x.key)),{alreadyBytes:selection.totalBytes,maxInputBytes:maxInput});
    for (const [i,asset] of extras.selected.entries()) {
      await writeJson(startupKey,{schema:'TIVVLEJOY_ORIGINAL14_STARTUP_V1',jobId,result:'RUNNING',stage,index:i+1,total:extras.extraSourceCount,sourceId:asset.sourceId,at:new Date().toISOString()});
      const dest=path.join(assetsDir,safeName(asset.sourceId,14+i,asset.key));
      await r2.downloadToFile(ctx,asset.key,dest);
      const observed=fs.statSync(dest).size;
      if(observed!==Number(asset.size)) throw Object.assign(new Error(`Downloaded size mismatch: ${asset.sourceId}`),{code:'ORIGINAL_14_SIZE_MISMATCH'});
      const digest=sha256File(dest);
      localAssets.push({role:asset.role,sourceId:asset.sourceId,collection:asset.collection,unityPreservationOnly:false,extra:true,localPath:dest,sha256:digest,byteSize:observed});
      log('original14_extra_materialized',{sourceId:asset.sourceId,byteSize:observed,sha256:digest});
    }

    const originalRenderable=localAssets.filter((a)=>!a.unityPreservationOnly && !a.extra);
    if(originalRenderable.length!==11) throw Object.assign(new Error('Renderable Original-14 count != 11'),{code:'ORIGINAL_14_RENDERABLE_COUNT_FAILED'});
    const renderable=localAssets.filter((a)=>!a.unityPreservationOnly);
    const louis=localAssets.find((a)=>a.sourceId==='SRC_LOUIS_BG_MOUNTAINS_V1');
    if(!louis || Number(louis.byteSize) < 512 * 1024 * 1024) {
      throw Object.assign(new Error('Louis contribution missing or below 512.1 MiB lock'),{code:'LOUIS_CONTRIBUTION_MISSING'});
    }
    contract.assertBotaniqExcluded([...selection.selected, ...extras.selected].map((row)=>row.key));
    if (strip(env.V7_LIVE_PODS_JSON)) {
      contract.assertZeroLivePods(JSON.parse(env.V7_LIVE_PODS_JSON));
    }
    contract.assertNoAutomaticRetry({
      retryCreate: strip(env.V7_AUTOMATIC_RETRY_CREATE).toLowerCase()==='true',
      createCount: Number(env.V7_PAID_CREATE_COUNT || 1),
    });

    stage='HOST_AND_LAUNCH_CONTRACT';
    const gpu=measureVram();
    const diskFree=measureDiskFree(workspace);
    contract.assertHostResources({ memTotal: os.totalmem(), vramMiB: gpu.vramMiB, diskFree });
    contract.assertRtx4090(gpu);
    const profile=resolveProfile(env);
    if (profile.id !== 'FINAL') {
      throw Object.assign(new Error('paid Original-14 worker encodes FINAL only; LOOKDEV/BLOCKOUT/HERO_STILL are local or stills profiles'),{code:'LOOKDEV_CANNOT_LABEL_FINAL'});
    }
    if (strip(env.VISUAL_APPROVAL_RECEIPT_RESULT).toUpperCase() !== 'PASS') {
      throw Object.assign(new Error('visual approval receipt is required before paid FINAL'),{code:'VISUAL_APPROVAL_REQUIRED'});
    }
    const resolved=contract.resolveFinalWorkerEnv(env);
    const extractRoot=path.join(workspace,'expanded-original14');
    await fsp.mkdir(extractRoot,{recursive:true});
    env.TIVVLEJOY_SCENERY_ASSETS_ROOT=extractRoot;
    env.TIVVLEJOY_SCENERY_OUTPUT_ROOT=outputDir;
    env.TIVVLEJOY_SCENERY_SCRIPTS_ROOT=strip(env.TIVVLEJOY_SCENERY_SCRIPTS_ROOT)||'/opt/ddp-worker/blender/scenery';
    const script=contract.FINAL_SCRIPT;
    const preflightFiles=[script, ...localAssets.map((row)=>row.localPath)];
    const receipts=requiredFileReceipts(preflightFiles);
    log('original14_required_files',{receipts: receipts.map((row)=>({name:row.name,exists:row.exists,bytes:row.bytes}))});
    if(receipts.some((row)=>!row.exists || !Number(row.bytes))) {
      throw Object.assign(new Error('required FINAL inputs missing before Blender'),{code:'REQUIRED_FILE_MISSING',receipts});
    }
    const identity=checkpoint.buildRenderIdentity({
      contentIdentity: strip(env.TIVVLEJOY_SCENE_CONTENT_SHA || env.TIVVLEJOY_SCENERY_SOURCE_COMMIT),
    });
    const checkpointPrefix=`${outputPrefix}/checkpoints`;
    const manifestPath=path.join(outputDir,'frame-checkpoint-manifest.json');
    const frameManifest=await checkpoint.loadManifest({transport:r2,ctx,prefix:checkpointPrefix,identity,destPath:manifestPath});
    const resumed=await checkpoint.materializeVerifiedFrames({transport:r2,ctx,prefix:checkpointPrefix,outputDir,identity,manifest:frameManifest});
    const verifiedJson=path.join(outputDir,'verified-frames.json');
    checkpoint.writeVerifiedFramesJson(verifiedJson, resumed);
    env.V7_VERIFIED_FRAMES_JSON=verifiedJson;
    const internalResolution='1080x1920';
    const samples=256;
    const blenderMinutes=resolved.blenderMinutes;
    const progressPath=path.join(outputDir,'render-progress.json');
    await writeJson(startupKey,{schema:'TIVVLEJOY_ORIGINAL14_STARTUP_V1',jobId,result:'RUNNING',stage,internalResolution,samples,frame:0,framesWritten:resumed.length,totalFrames:900,resumedFrames:resumed.length,at:new Date().toISOString()});
    const gl=resolveHeadlessGlConfig({env}); const renderEnv=applyHeadlessGlEnv(env,gl);
    renderEnv.TIVVLEJOY_SCENERY_ASSETS_ROOT=extractRoot;
    renderEnv.TIVVLEJOY_SCENERY_OUTPUT_ROOT=outputDir;
    renderEnv.TIVVLEJOY_SCENERY_SCRIPTS_ROOT=env.TIVVLEJOY_SCENERY_SCRIPTS_ROOT;
    renderEnv.V7_VERIFIED_FRAMES_JSON=verifiedJson;
    const blenderArgs=contract.buildBlenderArgs({
      assetsJson:JSON.stringify(renderable),
      outputDir,
      proofPath,
      progressPath,
    });
    contract.assertFinalBlenderArgs(blenderArgs);
    log('original14_blender_launch',{glMode:gl.mode,renderableSourceCount:renderable.length,internalResolution,samples,timeoutMinutes:blenderMinutes,waterVariant:'D',heroRebuild:'v3',resumedFrames:resumed.length});
    let lastProgressSig='';
    const publishProgress=async()=>{
      try {
        await checkpoint.checkpointNewFrames({transport:r2,ctx,prefix:checkpointPrefix,outputDir,identity,manifest:frameManifest});
      } catch (error) {
        log('original14_checkpoint_tick_error',{message:String(error.message||error).slice(0,300)});
      }
      const framesWritten=countPngFrames(outputDir);
      const progress=readProgressFile(progressPath)||{};
      const nextStage=framesWritten>0?'BLENDER_RENDER':(progress.stage||'BLENDER_STARTED');
      stage=nextStage;
      const payload={schema:'TIVVLEJOY_ORIGINAL14_STARTUP_V1',jobId,result:'RUNNING',stage:nextStage,internalResolution,samples,frame:Number(progress.frame||framesWritten||0),framesWritten,verifiedFrames:frameManifest.verifiedCount||0,totalFrames:900,at:new Date().toISOString()};
      const sig=`${payload.stage}:${payload.framesWritten}:${payload.frame}:${payload.verifiedFrames}`;
      if(sig===lastProgressSig) return;
      lastProgressSig=sig;
      await writeJson(startupKey,payload);
      log('original14_blender_progress',{stage:payload.stage,frame:payload.frame,framesWritten,verifiedFrames:payload.verifiedFrames});
    };
    const render=await runBlender({env:renderEnv,args:blenderArgs,timeoutMs:blenderMinutes*60_000,logPath:blenderLog,onTick:publishProgress});
    await publishProgress();
    if(render.error) throw Object.assign(new Error(`${render.error.message}: ${readTail(blenderLog)}`.slice(-7000)),{code:render.error.code==='ETIMEDOUT'?'TIMEOUT':'BLENDER_SPAWN_FAILED'});
    if(render.status!==0) throw Object.assign(new Error(`Blender exited ${render.status}: ${readTail(blenderLog)}`.slice(-7000)),{code:'BLENDER_FAILED'});

    stage='VERIFY_NATIVE_FRAMES';
    await checkpoint.checkpointNewFrames({transport:r2,ctx,prefix:checkpointPrefix,outputDir,identity,manifest:frameManifest});
    const internalManifest={frameRange:{start:1,end:900},resolution:internalResolution,fps:30};
    const frames=await core.verifyFrames({manifest:internalManifest,outputDir});
    if(frames.length<900) throw Object.assign(new Error(`Expected 900 frames, found ${frames.length}`),{code:'FRAME_COUNT_MISMATCH'});
    checkpoint.assertEncodeAllowed(frameManifest, identity);

    stage='ENCODE_NATIVE_1080X1920';
    await writeJson(startupKey,{schema:'TIVVLEJOY_ORIGINAL14_STARTUP_V1',jobId,result:'RUNNING',stage,profile:profile.id,at:new Date().toISOString()});
    const mp4Path=path.join(outputDir,'tivvlejoy-scenery-original14-30s.mp4');
    const enc=runFfmpeg({inputDir:outputDir,fps:30,outputPath:mp4Path,profile});
    if(enc.status!==0) throw Object.assign(new Error(`ffmpeg failed ${enc.status}: ${(enc.stderr||'').slice(-3000)}`),{code:'FFMPEG_FAILED'});
    const finalManifest={frameRange:{start:1,end:900},resolution:'1080x1920',fps:30};
    const info=await core.validateOutput({manifest:finalManifest,mp4Path});
    if(info.frames<900) throw Object.assign(new Error(`Final MP4 frame count ${info.frames}`),{code:'OUTPUT_FRAME_COUNT_MISMATCH'});

    const usage=JSON.parse(await fsp.readFile(proofPath,'utf8'));
    if(Number(usage.renderableSourceCount)!==11||Object.keys(usage.contributions||{}).length!==11||Number(usage.randomOrGeneratedStockAssetCount)!==0) {
      throw Object.assign(new Error('Original-14 Blender usage proof failed'),{code:'ORIGINAL_14_USAGE_CONTRACT_FAILED'});
    }

    stage='UPLOAD_AND_READBACK';
    const mp4Proof=await checkpoint.uploadMp4AndReadback({transport:r2,ctx,key:outputKey,filePath:mp4Path});
    const artifactSha256=mp4Proof.sha256;
    const readbackSha256=mp4Proof.sha256;
    await r2.uploadFile(ctx,proofKey,proofPath,'application/json');
    const sampleFrames=[1,180,360,540,720,900]; const sampleKeys=[];
    for(const n of sampleFrames){ const fp=path.join(outputDir,`frame_${String(n).padStart(4,'0')}.png`); if(!fs.existsSync(fp)) continue; const k=`${outputPrefix}/samples/frame_${String(n).padStart(4,'0')}.png`; await r2.uploadFile(ctx,k,fp,'image/png'); sampleKeys.push(k); }

    const complete={
      jobId,status:'COMPLETE',stage:'COMPLETE',outputKey,proofKey,selectionProofKey:selectionKey,sampleKeys,
      artifactSha256,readbackSha256,frameCount:info.frames,resolution:`${info.width}x${info.height}`,fps:30,durationSeconds:info.frames/30,
      originalSourceCount:14,renderableSourceCount:11,unityPreservationOnlyCount:3,collectionCount:4,
      materializedBytes:selection.totalBytes,internalResolution,samples,commercialAssetsPublished:false,at:new Date().toISOString(),
    };
    await writeJson(statusKey,complete);
    log('original14_showcase_complete',{jobId,frameCount:info.frames,artifactSha256,materializedBytes:selection.totalBytes});
    return 0;
  } catch(error) {
    const failed={jobId,status:'FAILED',stage,code:error.code||'ORIGINAL14_SHOWCASE_FAILED',message:String(error.message||error).slice(0,1400),commercialAssetsPublished:false,at:new Date().toISOString()};
    try { await writeJson(statusKey,failed); } catch(writeError) { log('failed_status_write_error',{message:String(writeError.message||writeError).slice(0,300)}); }
    log('original14_showcase_failed',{stage,code:failed.code,message:failed.message});
    return 1;
  }
}

main().then((code)=>{ process.exitCode=code; }).catch((error)=>{ console.error(error); process.exitCode=1; });

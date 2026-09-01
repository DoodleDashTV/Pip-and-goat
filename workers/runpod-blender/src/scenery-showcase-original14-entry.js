#!/usr/bin/env node
'use strict';

/** Immediate cold-start proof before Original-14 scenery worker handoff. */
const r2 = require('./r2-client');
function strip(v){ return String(v||'').replace(/[\r\n]+/g,'').trim(); }
function log(event,detail={}){ console.log(JSON.stringify({ts:new Date().toISOString(),event,...detail})); }

async function main(){
  const jobId=strip(process.env.RENDER_JOB_ID);
  if(!jobId) throw Object.assign(new Error('RENDER_JOB_ID required'),{code:'NO_JOB_ID'});
  const ctx=r2.createR2Client(process.env);
  const payload={schema:'TIVVLEJOY_ORIGINAL14_STARTUP_V1',jobId,result:'RUNNING',stage:'PROCESS_STARTED',at:new Date().toISOString()};
  await r2.uploadBuffer(ctx,`jobs/${jobId}/startup-status.json`,Buffer.from(`${JSON.stringify(payload,null,2)}\n`),'application/json');
  log('original14_process_started',{jobId,stage:payload.stage});
  require('./scenery-showcase-original14.js');
}
main().catch((error)=>{ log('original14_process_start_failed',{code:error?.code||'PROCESS_START_FAILED',message:String(error?.message||error).slice(0,1000)}); process.exitCode=1; });

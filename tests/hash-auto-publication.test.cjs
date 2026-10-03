'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const official=require('../assets/js/official-data.js');const {toPublicDataset}=require('../assets/js/league-repository.js');
const shared=import('../supabase/functions/_shared/public-content.mjs');
test('public content hash ignores object/row order but detects actual public changes',async()=>{
 const {contentHash}=await shared;const a=toPublicDataset(official),b=JSON.parse(JSON.stringify(a));b.teams.reverse();b.matches.reverse();assert.equal(await contentHash(a),await contentHash(b));b.teams[0].description+=' changed';assert.notEqual(await contentHash(a),await contentHash(b));
});
test('content hash is distinct from timestamp-sensitive snapshot identity',async()=>{
 const {createSnapshot}=require('../scripts/public-snapshot.cjs');const {contentHash}=await shared;
 const snapshot=await createSnapshot({environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz',seasonCode:official.season.code,sourceCommit:'a'.repeat(40),fixture:official});
 assert.equal(snapshot.metadata.contentHash,await contentHash(snapshot.data));assert.equal(snapshot.metadata.hashAlgorithm,'public-json-sha256-v1');assert.notEqual(snapshot.metadata.contentHash,snapshot.metadata.snapshotId);
});
test('automatic handler rejects absent/wrong secret and browser-origin callers before database',async()=>{
 const {handleAutomatic}=await import('../supabase/functions/auto-publish-public-snapshot/core.mjs');
 const deps={environment:'test',supabaseUrl:'https://vppjcjfbcoxzofcuxmzz.supabase.co',cronSecret:'s'.repeat(64),serviceClient:{rpc:()=>assert.fail('unauthorized must not query')},fetcher:()=>assert.fail('unauthorized must not fetch')};
 for(const headers of [{},{'X-Snapshot-Cron-Secret':'wrong'},{'X-Snapshot-Cron-Secret':'s'.repeat(64),Origin:'https://bollinmore-hermes.github.io'}]){const r=await handleAutomatic(new Request('https://test',{method:'POST',headers,body:'{}'}),deps);assert([401,403].includes(r.status));}
});

const cronRequest=()=>new Request('https://test',{method:'POST',headers:{'X-Snapshot-Cron-Secret':'s'.repeat(64)},body:'{}'});
function autoDeps(state){return {environment:'test',supabaseUrl:'https://vppjcjfbcoxzofcuxmzz.supabase.co',cronSecret:'s'.repeat(64),githubToken:'server-placeholder',serviceClient:{rpc:async name=>{assert.equal(name,'automatic_public_snapshot_state');return {data:state,error:null}}},fetcher:async()=>assert.fail('must not fetch')};}
test('unchanged, disabled and retry-paused automation does not contact GitHub or Pages',async()=>{
 const {handleAutomatic}=await import('../supabase/functions/auto-publish-public-snapshot/core.mjs');
 for(const [state,status] of [[{enabled:false},'disabled'],[{enabled:true,needs_publish:false},'unchanged'],[{enabled:true,needs_publish:true,retry_allowed:false},'retry_paused']]){const r=await handleAutomatic(cronRequest(),autoDeps(state));assert.equal(r.status,200);assert.equal((await r.json()).status,status);}
});
test('automatic publish reserves with no impersonated actor and the fixed season only',async()=>{
 const {handleAutomatic}=await import('../supabase/functions/auto-publish-public-snapshot/core.mjs');const deps=autoDeps({enabled:true,needs_publish:true,published_hash:'1'.repeat(64),retry_allowed:true});let dispatches=0;
 deps.serviceClient.rpc=async(name,args)=>{if(name==='automatic_public_snapshot_state')return {data:{enabled:true,needs_publish:true,published_hash:'1'.repeat(64),retry_allowed:true},error:null};assert.equal(name,'reserve_automatic_public_snapshot');assert(!('p_actor_id' in args));assert.equal(args.p_season_code,'2026-autumn-second-half');return {data:{id:'12345678-1234-1234-1234-123456789abc',source_commit:'a'.repeat(40),source_tag:null},error:null}};
 deps.fetcher=async(url,options)=>{if(url.includes('release-manifest'))return new Response(JSON.stringify({schemaVersion:1,environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz',sourceCommit:'a'.repeat(40),sourceTag:null}));if(url.endsWith('/dispatches')){dispatches++;assert.equal(JSON.parse(options.body).ref,'main');return new Response(null,{status:204})}return new Response(JSON.stringify({id:7}));};
 const r=await handleAutomatic(cronRequest(),deps);assert.equal(r.status,202);assert.equal((await r.json()).status,'queued');assert.equal(dispatches,1);
});
test('overlapping manual/automatic reservation is busy, never double-dispatched',async()=>{
 const {executePublication}=await import('../supabase/functions/publish-public-snapshot/core.mjs');let dispatches=0;
 const deps={environment:'test',githubToken:'server-placeholder',automatic:true,serviceClient:{rpc:async()=>({data:null,error:{code:'P0001'}})},fetcher:async(url)=>{if(url.endsWith('/dispatches')){dispatches++;throw new Error('must not dispatch')};return new Response(JSON.stringify(url.includes('release-manifest')?{schemaVersion:1,environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz',sourceCommit:'a'.repeat(40),sourceTag:null}:{id:7}))}};
 const r=await executePublication({action:'publish'},deps);assert.equal(r.status,429);assert.equal(dispatches,0);
});
test('ambiguous dispatch remains unknown and does not confirm the content hash',async()=>{
 const {executePublication}=await import('../supabase/functions/publish-public-snapshot/core.mjs');let update;
 const deps={environment:'test',githubToken:'server-placeholder',automatic:true,serviceClient:{rpc:async name=>{assert.equal(name,'reserve_automatic_public_snapshot');return {data:{id:'12345678-1234-1234-1234-123456789abc',source_commit:'a'.repeat(40),source_tag:null},error:null}},from:()=>({update:value=>({eq:async()=>{update=value;return {error:null}}})})},fetcher:async(url)=>{if(url.endsWith('/dispatches'))throw new Error('network result uncertain');return new Response(JSON.stringify(url.includes('release-manifest')?{schemaVersion:1,environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz',sourceCommit:'a'.repeat(40),sourceTag:null}:{id:7}))}};
 const r=await executePublication({action:'publish'},deps);assert.equal(r.status,202);assert.equal((await r.json()).status,'dispatch_unknown');assert.equal(update.status,'dispatch_unknown');
});
test('successful Actions is insufficient when deployed public content hash is wrong',async()=>{
 const {executePublication}=await import('../supabase/functions/publish-public-snapshot/core.mjs');const id='12345678-1234-1234-1234-123456789abc';let confirmations=0;
 const row={id,source_commit:'a'.repeat(40),source_tag:null,season_code:'2026-autumn-second-half',status:'running'};
 const deps={environment:'test',githubToken:'server-placeholder',automatic:true,serviceClient:{rpc:async()=>{confirmations++;return {error:null}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:row,error:null})})})})},fetcher:async(url)=>new Response(JSON.stringify(url.includes('/runs?')?{workflow_runs:[{id:8,workflow_id:7,display_title:'Snapshot publication / '+id,status:'completed',conclusion:'success'}]}:url.includes('public-league')?{schemaVersion:1,metadata:{requestId:id,sourceCommit:row.source_commit,sourceTag:null,environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz',seasonCode:row.season_code,generatedAt:new Date().toISOString(),contentHash:'0'.repeat(64),hashAlgorithm:'public-json-sha256-v1'},data:toPublicDataset(official)}:{id:7}))};
 const r=await executePublication({action:'status',request_id:id},deps);assert.equal(r.status,503);assert.equal(confirmations,0);
});
test('SQL hash scheduling stays local on unchanged content and keeps unknown requests blocked',()=>{
 const fs=require('node:fs');const sql=fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/011_public_snapshot_hash_auto.sql'),'utf8');
 assert(sql.indexOf("return 'unchanged'")<sql.indexOf('net.http_post'));assert.match(sql,/cron.schedule\('wuri-public-hash-check','\*\/5 \* \* \* \*'/);assert.match(sql,/status in \('queued','running','dispatch_unknown'\)/);assert.match(sql,/published_hash=p_content_hash/);assert(!sql.includes('version_number'));assert.match(sql,/revoke all on function public.check_public_snapshot_schedule\(\) from public,anon,authenticated,service_role/);
});

test('published confirmation stores the actual snapshot hash, not newer database content',async()=>{
 const {executePublication}=await import('../supabase/functions/publish-public-snapshot/core.mjs');const {contentHash}=await shared;const data=toPublicDataset(official),builtHash=await contentHash(data);const id='12345678-1234-1234-1234-123456789abc';let confirmed;
 const row={id,source_commit:'a'.repeat(40),source_tag:null,season_code:'2026-autumn-second-half',status:'running'};
 const client={rpc:async(name,args)=>{assert.equal(name,'confirm_public_snapshot_hash');confirmed=args;return {error:null}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:row,error:null})})}),update:()=>({eq:async()=>({error:null})})})};
 const deps={environment:'test',githubToken:'placeholder',automatic:true,serviceClient:client,fetcher:async url=>new Response(JSON.stringify(url.includes('/runs?')?{workflow_runs:[{id:8,workflow_id:7,display_title:'Snapshot publication / '+id,status:'completed',conclusion:'success'}]}:url.includes('public-league')?{schemaVersion:1,metadata:{requestId:id,sourceCommit:row.source_commit,sourceTag:null,environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz',seasonCode:row.season_code,generatedAt:new Date().toISOString(),contentHash:builtHash,hashAlgorithm:'public-json-sha256-v1'},data}:{id:7}))};
 const r=await executePublication({action:'status',request_id:id},deps);assert.equal((await r.json()).status,'published');assert.equal(confirmed.p_content_hash,builtHash);assert.equal(confirmed.p_request_id,id);
});
test('failed Actions never confirms hash and invokes bounded retry accounting',async()=>{
 const {executePublication}=await import('../supabase/functions/publish-public-snapshot/core.mjs');const id='12345678-1234-1234-1234-123456789abc';let failure=0;
 const client={rpc:async name=>{assert.equal(name,'record_snapshot_automation_failure');failure++;return {error:null}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id,status:'running'},error:null})})}),update:()=>({eq:async()=>({error:null})})})};
 const r=await executePublication({action:'status',request_id:id},{environment:'test',githubToken:'placeholder',automatic:true,serviceClient:client,fetcher:async url=>new Response(JSON.stringify(url.includes('/runs?')?{workflow_runs:[{id:8,workflow_id:7,display_title:'Snapshot publication / '+id,status:'completed',conclusion:'failure'}]}:{id:7}))});assert.equal((await r.json()).status,'failed');assert.equal(failure,1);
});

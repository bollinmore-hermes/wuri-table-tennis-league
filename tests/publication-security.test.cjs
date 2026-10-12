'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const modulePromise=import('../supabase/functions/publish-public-snapshot/core.mjs');
const url='https://vppjcjfbcoxzofcuxmzz.supabase.co';
const id='12345678-1234-1234-1234-123456789abc';
function request(body={action:'publish'},origin='https://bollinmore-hermes.github.io',authorization='Bearer user-session'){
 return new Request('https://function.test',{method:'POST',headers:{Origin:origin,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(body)});
}
function deps(role='admin',active=true){return {environment:'test',supabaseUrl:url,githubToken:'server-only-placeholder',userClient:{auth:{getUser:async()=>({data:{user:{id:'actor'}},error:null})}},serviceClient:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role,active},error:null})})})})},fetcher:async()=>{throw new Error('must not fetch')}}}
test('publication denies untrusted origin, anonymous, scorer and inactive admin before GitHub',async()=>{
 const {handlePublication}=await modulePromise;
 assert.equal((await handlePublication(request({},'https://evil.example'),deps())).status,403);
 assert.equal((await handlePublication(request({action:'publish'},undefined,''),deps())).status,401);
 assert.equal((await handlePublication(request(),deps('scorer'))).status,403);
 assert.equal((await handlePublication(request(),deps('admin',false))).status,403);
});
test('caller cannot select repository, branch, workflow, environment or arbitrary request identifier',async()=>{
 const {parseCommand,verifyManifest,handlePublication}=await modulePromise;
 for(const key of ['repo','ref','workflow','environment'])assert.throws(()=>parseCommand({action:'publish',[key]:'attacker'}));
 assert.throws(()=>parseCommand({action:'status',request_id:'../../other'}));
 assert.throws(()=>verifyManifest({schemaVersion:1,environment:'production',projectRef:'zofiiibgnjuodgrzhkpn',sourceCommit:'a'.repeat(40),sourceTag:'main'},'production'));
 const options=deps();options.githubToken='';const response=await handlePublication(request(),options);assert.equal(response.status,503);assert.equal((await response.json()).error,'publication_not_configured');
});
test('admin publish dispatches fixed workflow with only server-chosen provenance and no secrets in response',async()=>{
 const {handlePublication}=await modulePromise;const options=deps();const calls=[];
 options.serviceClient.rpc=async(name,args)=>{assert.equal(name,'reserve_public_snapshot');assert.equal(args.p_source_commit,'a'.repeat(40));return {data:{id,source_commit:'a'.repeat(40),source_tag:null},error:null}};
 options.fetcher=async(url,config)=>{calls.push([url,config]);if(url.includes('release-manifest'))return new Response(JSON.stringify({schemaVersion:1,environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz',sourceCommit:'a'.repeat(40),sourceTag:null}));if(url.endsWith('/dispatches')){const body=JSON.parse(config.body);assert.equal(body.ref,'main');assert.deepEqual(body.inputs,{request_id:id,expected_commit:'a'.repeat(40),expected_tag:''});return new Response(null,{status:204})}return new Response(JSON.stringify({id:5}))};
 const response=await handlePublication(request(),options);assert.equal(response.status,202);const text=await response.text();assert(!text.includes(options.githubToken));assert.equal(JSON.parse(text).status,'queued');assert.equal(calls.length,3);
});
test('SQL reserves globally under a lock, audits, and is service-only',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/010_public_snapshot_publication.sql'),'utf8');
 assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/app_role is distinct from 'admin'/);assert.match(sql,/revoke all on public\.snapshot_publications from public,anon,authenticated/);assert.match(sql,/grant execute on function public\.reserve_public_snapshot\(uuid,text,text\) to service_role/);assert.match(sql,/publish_snapshot_requested/);
});
test('only admin UI exposes publication; score save never dispatches automatically',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../admin.html'),'utf8');const js=fs.readFileSync(path.resolve(__dirname,'../assets/js/admin.js'),'utf8');
 assert.match(html,/data-admin-only data-remote-only[\s\S]*?id="publishSnapshot"/);
 const save=fs.readFileSync(path.resolve(__dirname,'../assets/js/result-review.js'),'utf8');assert(!save.includes('publication('));assert.match(save,/request\.blocked/);assert.match(js,/if\(!isAdmin\(\)\|\|!remoteEnabled/);
});

test('Production publication dispatches the verified published release tag, never main',async()=>{
 const {handlePublication}=await modulePromise;const options=deps();let dispatched=null;
 options.environment='production';options.supabaseUrl='https://zofiiibgnjuodgrzhkpn.supabase.co';
 options.serviceClient.rpc=async(name,args)=>{assert.equal(name,'reserve_public_snapshot');assert.equal(args.p_source_tag,'v0.8.0');return {data:{id,source_commit:args.p_source_commit,source_tag:args.p_source_tag},error:null}};
 options.fetcher=async(url,config)=>{
  assert(!url.includes('wuri-table-tennis-league-test'));
  if(url.includes('release-manifest'))return new Response(JSON.stringify({schemaVersion:1,environment:'production',projectRef:'zofiiibgnjuodgrzhkpn',sourceCommit:'b'.repeat(40),sourceTag:'v0.8.0'}));
  if(url.endsWith('/dispatches')){dispatched=JSON.parse(config.body);return new Response(null,{status:204})}
  return new Response(JSON.stringify({id:5}));
 };
 const response=await handlePublication(request(),options);assert.equal(response.status,202);assert.equal((await response.json()).status,'queued');
 assert.deepEqual(dispatched,{ref:'v0.8.0',inputs:{request_id:id,expected_commit:'b'.repeat(40),expected_tag:'v0.8.0'}});
});
test('Production invalid or missing release tag fails before reserving or dispatching',async()=>{
 const {handlePublication}=await modulePromise;
 for(const sourceTag of [null,'','main','vlatest','v0.8.0/other','refs/tags/v0.8.0']){
  const options=deps();options.environment='production';options.supabaseUrl='https://zofiiibgnjuodgrzhkpn.supabase.co';let calls=0;
  options.serviceClient.rpc=async()=>{assert.fail('Must not reserve for invalid release')};
  options.fetcher=async url=>{calls++;assert(url.includes('release-manifest'));return new Response(JSON.stringify({schemaVersion:1,environment:'production',projectRef:'zofiiibgnjuodgrzhkpn',sourceCommit:'b'.repeat(40),sourceTag}))};
  const response=await handlePublication(request(),options);assert.equal(response.status,503);assert.equal((await response.json()).error,'publication_unavailable');assert.equal(calls,1);
 }
});

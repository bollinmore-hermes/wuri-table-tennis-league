const test=require('node:test'),assert=require('node:assert/strict');
const {toPublicDataset,contentHash}=require('../assets/js/league-repository.js');
const official=require('../assets/js/official-data.js');
async function fixture({role='admin',network='ok',state='pending',conflict=false}={}){
 const {handleSeasonArchives}=await import('../supabase/functions/season-archives/core.mjs');
 const league=toPublicDataset(official);league.matches=league.matches.filter(m=>m.status==='final');league.roster=[];
 const content={league,rules:{text:'核定規程（測試）',source:'測試'},final_rankings:[],final_rankings_note:'未提供（測試）',exceptions:[],ranking_method:'points-v1'};
 const id='12345678-1234-4234-8234-123456789abc',hash=await contentHash(content),time=new Date().toISOString();let stored=state==='published',uploads=0,confirmations=0,authCalls=0;
 const record={id,season_code:league.season.code,state,content_hash:hash,public_content:content,created_at:time};
 const envelope={schemaVersion:1,environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz',seasonCode:record.season_code,archiveId:id,archivedAt:time,contentHash:hash,content};
 const userClient={auth:{async getUser(){authCalls++;return {data:{user:{id:'test-admin'}},error:null}}},async rpc(name){if(name==='get_my_profile')return {data:{role,active:true}};if(name==='preview_season_archive')return {data:{eligible:true,revision_hash:'1'.repeat(64),content}};if(name==='reserve_season_archive'&&conflict)return {error:{code:'PT409'}};return {data:structuredClone(record)}}};
 const serviceClient={async rpc(name){if(name==='confirm_season_archive'){confirmations++;return {data:{id,state:'published'}}}return {data:[]}},storage:{from(bucket){assert.equal(bucket,'wuri-season-archives');return {async upload(path,body,options){uploads++;assert.equal(options.upsert,false);assert.equal(JSON.parse(body).contentHash,hash);stored=true;return {data:{path}}}}}}};
 const fetcher=async()=>{if(network==='unknown')throw Error('network unavailable');if(network==='tampered')return new Response(JSON.stringify({...envelope,contentHash:'0'.repeat(64)}));return stored?new Response(JSON.stringify(envelope)):network==='missing400'?new Response(JSON.stringify({statusCode:'404',error:'not_found'}),{status:400}):new Response('',{status:404})};
 const options={rules_text:'核定規程（測試）',rules_source:'測試',final_rankings:[],final_rankings_note:'未提供（測試）',exceptions:[],all_stages_closed:true,results_confirmed:true,public_scope_confirmed:true};
 const make=(action='archive',headers={})=>new Request('https://vppjcjfbcoxzofcuxmzz.supabase.co/functions/v1/season-archives',{method:'POST',headers:{origin:'https://bollinmore-hermes.github.io',authorization:'Bearer fixture-token','content-type':'application/json',...headers},body:JSON.stringify({action,season_code:record.season_code,options,revision_hash:'1'.repeat(64),request_id:id})});
 const run=req=>handleSeasonArchives(req,{environment:'test',supabaseUrl:'https://vppjcjfbcoxzofcuxmzz.supabase.co',userClient,serviceClient,fetcher});
 return {run,make,stats:()=>({uploads,confirmations,authCalls})};
}
test('archive Edge requires exact origin, session and active admin',async()=>{
 const b=await fixture();assert.equal((await b.run(b.make('archive',{origin:'https://evil.example'}))).status,403);assert.equal((await b.run(b.make('archive',{authorization:''}))).status,401);assert.equal(b.stats().authCalls,0);
 const scorer=await fixture({role:'scorer'});assert.equal((await scorer.run(scorer.make())).status,403);assert.equal(scorer.stats().uploads,0);
});
test('archive publishes immutable bytes, verifies anonymous readback then finalizes',async()=>{
 const b=await fixture();const r=await b.run(b.make());assert.equal(r.status,200);assert.equal((await r.json()).archive.public_verified,true);assert.equal(b.stats().uploads,1);assert.equal(b.stats().confirmations,1);
});
test('unknown storage outcome stays pending without blind uploads or confirmation',async()=>{
 const b=await fixture({network:'unknown'});const r=await b.run(b.make());assert.equal(r.status,202);assert.equal((await r.json()).archive.state,'pending');assert.equal(b.stats().uploads,0);assert.equal(b.stats().confirmations,0);
});
test('status is read-only when pending object is absent',async()=>{
 const b=await fixture();assert.equal((await b.run(b.make('status'))).status,202);assert.equal(b.stats().uploads,0);assert.equal(b.stats().confirmations,0);
});
test('tampered readback never confirms or overwrites',async()=>{
 const b=await fixture({network:'tampered'});const r=await b.run(b.make());assert.notEqual(r.status,200);assert.equal(b.stats().uploads,0);assert.equal(b.stats().confirmations,0);
});
test('published receipt is verified without a second upload or finalization',async()=>{
 const b=await fixture({state:'published'});const r=await b.run(b.make('status'));assert.equal(r.status,200);assert.equal(b.stats().uploads,0);assert.equal(b.stats().confirmations,0);
});
test('HTTP-mapped conflict returns 409 without storage writes',async()=>{const b=await fixture({conflict:true});const r=await b.run(b.make());assert.equal(r.status,409);assert.equal((await r.json()).error,'preview_changed');assert.equal(b.stats().uploads,0)});
test('Supabase Storage 400 with statusCode 404 is a definite missing object',async()=>{const b=await fixture({network:'missing400'});const r=await b.run(b.make());assert.equal(r.status,200);assert.equal(b.stats().uploads,1)});
test('anonymous catalog never exposes pending drafts or private record fields',async()=>{
 const b=await fixture();const r=await b.run(new Request('https://vppjcjfbcoxzofcuxmzz.supabase.co/functions/v1/season-archives'));assert.equal(r.status,200);assert.deepEqual((await r.json()).archives,[]);assert.equal(b.stats().authCalls,0);
});

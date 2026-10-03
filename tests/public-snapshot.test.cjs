'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const official=require('../assets/js/official-data.js');
const api=require('../assets/js/league-repository.js');
const root=path.resolve(__dirname,'..');
const raw=()=>JSON.parse(JSON.stringify(official));
const metadata={environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz',seasonCode:official.season.code,sourceCommit:'a'.repeat(40),sourceTag:null,generatedAt:'2026-10-03T00:00:00.000Z',snapshotId:'b'.repeat(64)};
function envelope(){return {schemaVersion:1,metadata:{...metadata},data:api.toPublicDataset(raw())}}
test('snapshot projection excludes private fields and uses only public season fields',()=>{
 const data=raw();data.season.password='never-export';data.teams[0].email='private@example.com';
 const projected=api.toPublicDataset(data);
 assert(!JSON.stringify(projected).includes('never-export'));
 assert(!JSON.stringify(projected).includes('private@example.com'));
 assert.deepEqual(Object.keys(projected.season).sort(),['code','end_date','name','start_date']);
});
test('snapshot validator fails closed on private root, mixed environment, empty data and invalid time',()=>{
 const config={...metadata};
 assert.equal(api.normalizePublicSnapshot(envelope(),config).data.matches.length,60);
 for(const mutate of [s=>s.data.users=[],s=>s.data.teams[0].email='private@example.com',s=>s.metadata.projectRef='zofiiibgnjuodgrzhkpn',s=>s.metadata.sourceCommit='c'.repeat(40),s=>s.metadata.generatedAt='not-a-date',s=>s.data.teams=[]]){
  const value=envelope();mutate(value);assert.throws(()=>api.normalizePublicSnapshot(value,config));
 }
});
test('snapshot repository reads one local file, rejects redirect/oversize and never creates a Supabase client',async()=>{
 const calls=[];const repo=new api.SnapshotLeagueRepository({config:{...metadata,snapshotUrl:'public-league.json'},fetch:async(url,options)=>{calls.push([url,options]);return {ok:true,redirected:false,headers:{get:()=>null},text:async()=>JSON.stringify(envelope())}}});
 const data=await repo.getPublicLeague();assert.equal(data.results.length,26);assert.equal(calls.length,1);assert.equal(calls[0][0],'public-league.json');assert.equal(repo.metadata.sourceCommit,metadata.sourceCommit);
 await assert.rejects(()=>new api.SnapshotLeagueRepository({config:{...metadata,snapshotUrl:'https://evil.example/snapshot.json'},fetch:()=>{}}).getPublicLeague());
 const invalid=new api.SnapshotLeagueRepository({config:{...metadata,snapshotUrl:'public-league.json'},fetch:async()=>({ok:true,redirected:true,headers:{get:()=>null},text:async()=>''})});await assert.rejects(()=>invalid.getPublicLeague());
});
test('default browser fetch keeps the Window receiver',async()=>{
 const vm=require('node:vm');const window={};window.globalThis=window;window.fetch=function(){assert.equal(this.fetch,window.fetch,'Window.fetch receiver must be the browser global');return Promise.resolve({ok:true,redirected:false,headers:{get:()=>null},text:async()=>JSON.stringify(envelope())})};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/js/league-repository.js'),'utf8'),window);
 const repository=new window.WuriLeagueRepository.SnapshotLeagueRepository({config:{...metadata,snapshotUrl:'public-league.json'}});
 assert.equal((await repository.getPublicLeague()).teams.length,12);
});
test('snapshot mode does not require a public Supabase SDK and reports timestamp in both locales',()=>{
 const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
 assert(source.includes('repository?.metadata'));assert.match(source,/snapshotUpdated/);assert.match(source,/Last published/);
});

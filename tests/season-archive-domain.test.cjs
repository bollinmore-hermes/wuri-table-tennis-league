'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../assets/js/season-archive-domain.js');
const official=require('../assets/js/official-data.js');
const {toPublicDataset,contentHash}=require('../assets/js/league-repository.js');
function options(){return {rules_text:'正式規則依主辦核定',rules_source:'主辦核定資料',final_rankings:[],final_rankings_note:'主辦未提供最終名次',exceptions:[],all_stages_closed:true,results_confirmed:true,public_scope_confirmed:true}}
test('archive options require explicit closure and no invented final ranks',()=>{
 const o=D.normalizeOptions(options());assert.deepEqual(o.final_rankings,[]);
 assert.throws(()=>D.normalizeOptions({...options(),final_rankings_note:''}));
 assert.throws(()=>D.normalizeOptions({...options(),all_stages_closed:false}));
 assert.throws(()=>D.normalizeOptions({...options(),secret:'must reject'}));
});
test('archive standings reuse current 3-0 / 2-1 points without inventing final championship',()=>{
 const data=toPublicDataset(official),out=D.standings(data,'A');assert.equal(out.length,6);assert.equal(out.reduce((n,r)=>n+r.wins,0),data.results.filter(r=>data.matches.find(m=>m.match_code===r.match_code)?.group==='A').length);
 assert.ok(out.every(r=>r.points>=0));assert.ok(out.every(r=>r.played===r.wins+r.losses));
});
test('archive normalization verifies hash, target environment and public whitelist',async()=>{
 const data=toPublicDataset(official);data.roster=[];data.matches=data.matches.filter(m=>m.status==='final');
 const content={league:data,rules:{text:'當季核定規則',source:'主辦'},final_rankings:[],final_rankings_note:'未提供',exceptions:[],ranking_method:'points-v1'};
 const envelope={schemaVersion:1,environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz',seasonCode:data.season.code,archiveId:'12345678-1234-4234-8234-123456789abc',archivedAt:new Date().toISOString(),contentHash:await contentHash(content),content};
 const config={environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz'};
 assert.equal((await D.normalizeArchive(envelope,config)).content.league.teams.length,12);
 await assert.rejects(()=>D.normalizeArchive({...envelope,environment:'production'},config));
 await assert.rejects(()=>D.normalizeArchive({...envelope,contentHash:'0'.repeat(64)},config));
 const leaked=structuredClone(content);leaked.league.teams[0].email='private@example.com';
 await assert.rejects(async()=>D.normalizeArchive({...envelope,content:leaked,contentHash:await contentHash(leaked)},config));
});

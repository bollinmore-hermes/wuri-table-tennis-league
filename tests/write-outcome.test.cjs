'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {SupabaseRepository}=require('../assets/js/admin-repository.js');
test('score save succeeds without reloading; refresh failure cannot reverse committed result',async()=>{
 const calls=[];const repo=new SupabaseRepository({rpc:async(name)=>{calls.push(name);if(name==='save_match_result')return {data:{version:2},error:null,status:200};throw new Error('reload unavailable')}},{});
 assert.equal((await repo.saveResult({match_code:'M1',home_score:2,away_score:1})).version,2);
 assert.deepEqual(calls,['save_match_result']);await assert.rejects(()=>repo.load(),/reload unavailable/);
});
test('import returns committed result without implicit reload',async()=>{
 const calls=[];const repo=new SupabaseRepository({rpc:async(name)=>{calls.push(name);return {data:{imported:true},error:null,status:200}}},{clean:p=>p});
 assert.deepEqual(await repo.import({results:[]}),{imported:true});assert.deepEqual(calls,['import_league_data']);
});
test('network write outcome is uncertain, explicit denial is rejected, no automatic retries',async()=>{
 for(const [reply,state] of [[{error:{message:'Failed to fetch',code:''},status:0},'unknown'],[{error:{message:'denied',code:'42501'},status:403},'rejected']]){
 let calls=0;const repo=new SupabaseRepository({rpc:async()=>{calls++;return reply}},{});
 await assert.rejects(()=>repo.saveResult({match_code:'M1',home_score:2,away_score:1}),e=>e.mutationState===state);assert.equal(calls,1);
 }
});
test('score saved but lock failed is explicitly partial, not a failed score save',async()=>{
 const repo=new SupabaseRepository({rpc:async(name)=>name==='save_match_result'?{data:{version:2},error:null,status:200}:{error:{message:'lock unavailable'},status:503}},{});
 await assert.rejects(()=>repo.saveResult({match_code:'M1',home_score:2,away_score:1,locked:true}),e=>e.mutationState==='saved');
});

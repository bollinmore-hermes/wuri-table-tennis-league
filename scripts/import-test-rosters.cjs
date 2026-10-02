'use strict';
// Explicitly gated Test-only importer. Never logs or writes full names or tokens.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createClient}=require('@supabase/supabase-js');
const {prepare,publicProjection}=require('./prepare-private-rosters.cjs');
const root=path.resolve(__dirname,'..'),ref='vppjcjfbcoxzofcuxmzz',season='2026-autumn-second-half';
const bySlot=(a,b)=>a.team_code.localeCompare(b.team_code)||(a.roster_role==='leader'?0:1)-(b.roster_role==='leader'?0:1)||a.display_order-b.display_order;
(async()=>{
 assert.equal(process.env.SUPABASE_TEST_URL,`https://${ref}.supabase.co`,'Test identity mismatch');
 const key=process.env.SUPABASE_TEST_PUBLISHABLE_KEY;assert(key&&key.length>20&&!key.startsWith('sb_secret_'),'Browser publishable key required');
 const filename=path.resolve(process.argv.find(arg=>arg.startsWith('--source='))?.slice(9)||path.join(root,'.private/rosters.json'));
 assert(filename.startsWith(path.join(root,'.private')+path.sep),'Private source must remain in .private');
 const input=JSON.parse(fs.readFileSync(filename,'utf8')),payload=prepare(input),expectedPublic=publicProjection(payload).sort(bySlot);
 const fullNames=payload.flatMap(team=>team.members.map(member=>member.name));
 const client=createClient(process.env.SUPABASE_TEST_URL,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const auth=await client.auth.signInWithPassword({email:process.env.SUPABASE_TEST_ADMIN_EMAIL,password:process.env.SUPABASE_TEST_ADMIN_PASSWORD});assert(!auth.error&&auth.data.user,'Test administrator sign-in failed');
 const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args);assert(!error,`RPC verification failed: ${name}`);return data};
 try{
  const profile=await rpc('get_my_profile',{});assert(profile.role==='admin'&&profile.active===true,'Active administrator required');
  const before=await rpc('get_admin_dataset',{p_season_code:season});
  const slots=new Map(payload.flatMap(team=>team.members.map(member=>[`${team.team_code}:${member.roster_role}:${member.display_order}`,member.name])));
  for(const p of before.players){assert.equal(p.season_code,season,'Unrelated roster would require reconciliation');assert.equal(p.name,slots.get(`${p.team_code}:${p.roster_role}:${p.display_order}`),'Existing roster conflicts with private source');}
  const counts=data=>({teams:data.teams.length,matches:data.matches.length,results:data.results.length,snapshots:data.snapshots.length});
  let imported={changed:0};
  if(process.argv.includes('--apply')){
   imported=await rpc('import_team_rosters',{p_season_code:season,p_rosters:payload});
   const after=await rpc('get_admin_dataset',{p_season_code:season});assert.deepEqual(counts(after),counts(before));assert.equal(after.players.length,fullNames.length);assert.deepEqual(after.players.map(p=>p.name).sort(),fullNames.slice().sort());
   const repeat=await rpc('import_team_rosters',{p_season_code:season,p_rosters:payload});assert.equal(repeat.changed,0,'Repeated import must not mutate');
   const anon=createClient(process.env.SUPABASE_TEST_URL,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const publicResult=await anon.rpc('get_public_league',{p_season_code:season});assert(!publicResult.error,'Anonymous public RPC failed');
   const data=publicResult.data;assert.deepEqual(data.roster.slice().sort(bySlot),expectedPublic);assert(fullNames.every(name=>!JSON.stringify(data).includes(name)));assert.deepEqual(counts(data),counts(before));
   const denial=await anon.rpc('get_admin_dataset',{p_season_code:season});assert(denial.error&&['42501','PGRST301'].includes(denial.error.code),'Anonymous management RPC must deny');
   const tableDenial=await anon.from('players').select('id').limit(1);assert(tableDenial.error,'Anonymous direct roster table must deny');
   const adminTableDenial=await client.from('players').select('id').limit(1);assert(adminTableDenial.error,'Browser admin direct roster table must deny');
   const evidence={ok:true,projectRef:ref,applied:true,administratorAuth:true,administratorFullNamesVerified:true,publicMaskedNamesVerified:true,publicFullNamesAbsent:true,anonymousManagementDenied:true,anonymousAndAdminDirectTableDenied:true,teams:payload.length,leaders:payload.length,players:fullNames.length-payload.length,members:fullNames.length,importChanged:imported.changed,repeatImportChanged:repeat.changed,preservedLeagueCounts:counts(after),verifiedAt:new Date().toISOString()};
   fs.writeFileSync(path.join(root,'docs/evidence/issue-29/remote-roster-verification.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
  }else console.log(JSON.stringify({ok:true,projectRef:ref,dryRun:true,currentRosterCount:before.players.length,plannedMembers:fullNames.length,remoteWrites:false}));
 }finally{await client.auth.signOut({scope:'local'});}
})().catch(error=>{console.error(JSON.stringify({ok:false,error:'Test roster verification or import failed; no credential/name payloads logged',stage:'assertion_or_rpc_failure'}));process.exitCode=1});

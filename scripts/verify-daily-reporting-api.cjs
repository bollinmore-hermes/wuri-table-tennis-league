'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createClient}=require('@supabase/supabase-js'),{randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),url=process.env.SUPABASE_TEST_URL,key=process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
if(url!=='https://vppjcjfbcoxzofcuxmzz.supabase.co')throw Error('Test-only verifier');
const query=sql=>JSON.parse(execFileSync(path.join(root,'node_modules/.bin/supabase'),['db','query','--linked','--project-ref','vppjcjfbcoxzofcuxmzz',sql],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']})).rows;
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),anon=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const rpc=async(c,name,args)=>{const r=await c.rpc(name,args);if(r.error)throw Error(`${name}: ${r.error.code}`);return r.data},denied=async(c,name,args)=>{const r=await c.rpc(name,args);assert(Boolean(r.error),`${name} unexpectedly allowed`)};
(async()=>{
const auth=await client.auth.signInWithPassword({email:process.env.SUPABASE_TEST_ADMIN_EMAIL,password:process.env.SUPABASE_TEST_ADMIN_PASSWORD});if(auth.error)throw Error('Test admin sign-in failed');
try{
const official=await rpc(anon,'get_public_league',{p_season_code:'2026-autumn-second-half'}),hash=()=>createHash('sha256').update(JSON.stringify(official)).digest('hex');
const suffix=randomUUID().slice(0,8),season=`issue-53-api-${suffix}`,prefix=`I53-${suffix}`;
query(`do $$ declare s uuid; ga uuid; gb uuid; h uuid; a uuid; b uuid; c uuid; begin
insert into public.seasons(code,name,status) values('${season}','Issue 53 synthetic verification','inactive') returning id into s;
insert into public.groups(season_id,code,name) values(s,'A','Synthetic A') returning id into ga;insert into public.groups(season_id,code,name) values(s,'B','Synthetic B') returning id into gb;
insert into public.teams(team_code,name,short_name) values('${prefix}-A1','驗收左隊 A','驗收左 A') returning id into h;insert into public.teams(team_code,name,short_name) values('${prefix}-A2','驗收右隊 A','驗收右 A') returning id into a;
insert into public.teams(team_code,name,short_name) values('${prefix}-B1','驗收左隊 B','驗收左 B') returning id into b;insert into public.teams(team_code,name,short_name) values('${prefix}-B2','驗收右隊 B','驗收右 B') returning id into c;
insert into public.season_teams(season_id,group_id,team_id) values(s,ga,h),(s,ga,a),(s,gb,b),(s,gb,c);
insert into public.matches(season_id,group_id,match_code,match_date,match_time,home_team_id,away_team_id,published) values(s,ga,'${prefix}-M1','2099-01-01','15:30',h,a,false),(s,ga,'${prefix}-M2','2099-01-01','16:00',h,a,false),(s,gb,'${prefix}-M3','2099-01-01','16:30',b,c,false),(s,gb,'${prefix}-M4','2099-01-02','15:30',b,c,false);end $$; select true as created;`);
const args={p_season_code:season,p_date:'2099-01-01',p_action:'create'},link=await rpc(client,'manage_daily_report_link',args);
assert((await rpc(client,'manage_daily_report_link',args)).token===link.token,'repeated generation changes token');
const schedule=await rpc(anon,'get_daily_report_schedule',{p_token:link.token});assert.equal(schedule.matches.length,3);assert.deepEqual([...new Set(schedule.matches.map(m=>m.group))].sort(),['A','B']);assert(!JSON.stringify(schedule).includes('home_score'));
const submit=(code,h,a,request_id=randomUUID())=>rpc(anon,'submit_referee_report',{p_token:link.token,p_match_code:code,p_request_id:request_id,p_home_score:h,p_away_score:a});
const request=randomUUID();await submit(`${prefix}-M1`,3,0,request);await submit(`${prefix}-M1`,3,0,request);await submit(`${prefix}-M1`,3,0);await submit(`${prefix}-M1`,2,1);await submit(`${prefix}-M2`,3,0);
const queue=await rpc(client,'get_result_review_queue',{p_season_code:season});assert.equal(queue.filter(r=>r.match_code===`${prefix}-M1`).length,2);
const status=await rpc(anon,'get_referee_report_status',{p_token:link.token,p_match_code:`${prefix}-M1`,p_request_id:request});assert.equal(status.status,'received');
await denied(anon,'submit_referee_report',{p_token:link.token,p_match_code:`${prefix}-M4`,p_request_id:randomUUID(),p_home_score:3,p_away_score:0});await denied(anon,'get_result_review_queue',{p_season_code:season});await denied(anon,'manage_daily_report_link',args);await denied(anon,'confirm_reported_result',{p_season_code:season,p_match_code:`${prefix}-M1`,p_request_id:randomUUID(),p_report_id:null,p_home_score:3,p_away_score:0,p_note:'',p_expected_version:0});
for(const table of ['daily_report_links','referee_reports','referee_report_requests','result_review_requests']){assert(Boolean((await anon.from(table).select('*').limit(1)).error),`anon table ${table}`);assert(Boolean((await client.from(table).select('*').limit(1)).error),`admin browser table ${table}`)}
const after=await rpc(anon,'get_public_league',{p_season_code:'2026-autumn-second-half'});assert(createHash('sha256').update(JSON.stringify(after)).digest('hex')===hash(),'official public projection changed');
fs.mkdirSync(path.join(root,'.private'),{recursive:true,mode:0o700});fs.writeFileSync(path.join(root,'.private/issue53-fixture.json'),JSON.stringify({season,prefix,token:link.token,date:'2099-01-01'}),{mode:0o600});
const evidence={ok:true,projectRef:'vppjcjfbcoxzofcuxmzz',realAdminAuth:true,realAnonymousRPC:true,scopeAndDedupeVerified:true,privateTablesDeniedToAnonAndBrowserAdmin:true,originalPublicProjectionUnchanged:true,retainedSynthetic:{seasons:1,groups:2,teams:4,matches:4,reports:3},scorerJwt:'not tested; scorer database guards verified separately',fixtureCapabilityFile:'.private/issue53-fixture.json (gitignored, never publish)'};
const evidenceDir=path.resolve(process.env.REPORTING_EVIDENCE_DIR||path.join(root,'docs/evidence/issue-53'));fs.mkdirSync(evidenceDir,{recursive:true});fs.writeFileSync(path.join(evidenceDir,'remote-api.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await client.auth.signOut({scope:'local'})}
})().catch(e=>{console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1});

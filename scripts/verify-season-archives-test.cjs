const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');const D=require('../assets/js/season-archive-domain.js');
const url=process.env.SUPABASE_TEST_URL,key=process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
if(url!=='https://vppjcjfbcoxzofcuxmzz.supabase.co'||!key||!process.argv[2]||!process.argv[3])throw Error('Explicit Test URL, credentials, fixture manifest and evidence output required');
const fixtures=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),fixture=fixtures.find(f=>f.kind==='api'),checks=[];
const timedFetch=(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(20000)});
const client=createClient(url,key,{global:{fetch:timedFetch},auth:{persistSession:false,autoRefreshToken:false}});
const options={rules_text:'這是合成驗收用規則，並非正式聯賽規程。團體比分採 3–0 或 2–1；此賽季僅供封存功能測試。',rules_source:'Issue 37 合成驗收資料',final_rankings:fixture.teams.map((team_code,i)=>({team_code,rank:i+1})),final_rankings_note:'',exceptions:[],all_stages_closed:true,results_confirmed:true,public_scope_confirmed:true};
function check(name,value){assert.ok(value,name);checks.push(name);console.log('PASS '+name)}
async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw Error(name+': '+error.code);return data}
(async()=>{
 const sign=await client.auth.signInWithPassword({email:process.env.SUPABASE_TEST_ADMIN_EMAIL,password:process.env.SUPABASE_TEST_ADMIN_PASSWORD});if(sign.error)throw Error('Test admin sign-in failed');const jwt=sign.data.session.access_token;
 const call=async(body,headers={})=>{const r=await timedFetch(url+'/functions/v1/season-archives',{method:'POST',headers:{origin:'https://bollinmore-hermes.github.io',apikey:key,authorization:'Bearer '+jwt,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 check('anonymous mutation denied',(await call({action:'status',season_code:fixture.seasonCode},{authorization:''})).status===401);
 check('lookalike origin denied',(await call({action:'status',season_code:fixture.seasonCode},{origin:'https://bollinmore-hermes.github.io.evil.example'})).status===403);
 const anon=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const direct=await anon.from('season_archives').select('*');check('anonymous base table denied',direct.error?.code==='42501');
 const serviceOnly=await client.rpc('confirm_season_archive',{p_id:randomUUID(),p_hash:'0'.repeat(64),p_object_path:'forbidden'});check('browser admin cannot finalize archive',serviceOnly.error?.code==='42501');
 const current=await rpc('preview_season_archive',{p_season_code:'2026-autumn-second-half',p_options:{...options,final_rankings:[],final_rankings_note:'主辦未提供最終名次'}});check('existing active league remains blocked',!current.eligible&&current.blockers.some(x=>x.code==='unresolved_match'));check('pending reports are detected',current.blockers.some(x=>x.code==='pending_report'));
 let state=await rpc('get_season_archive_status',{p_season_code:fixture.seasonCode});
 if(state.state==='live'){
  const preview=await rpc('preview_season_archive',{p_season_code:fixture.seasonCode,p_options:options});check('synthetic season eligible',preview.eligible);
  let dataset=await rpc('get_admin_dataset',{p_season_code:fixture.seasonCode});let result=dataset.results.find(x=>x.match_code===fixture.matchCode);
  const changed=await rpc('save_match_result',{p_match_code:fixture.matchCode,p_home_score:2,p_away_score:1,p_note:'合成測試：核對後資料變更',p_expected_version:result.version});
  const rejected=await call({action:'archive',season_code:fixture.seasonCode,options,revision_hash:preview.revision_hash,request_id:randomUUID()});check('stale preview rejected by live backend',rejected.status===409&&rejected.body.error==='preview_changed');
  await rpc('save_match_result',{p_match_code:fixture.matchCode,p_home_score:3,p_away_score:0,p_note:'合成測試：恢復驗收比分',p_expected_version:changed.version});
  const fresh=await rpc('preview_season_archive',{p_season_code:fixture.seasonCode,p_options:options});
  const archive=await call({action:'archive',season_code:fixture.seasonCode,options,revision_hash:fresh.revision_hash,request_id:randomUUID()});
  check('archive public upload and verification complete',archive.status===200&&archive.body.archive?.state==='published'&&archive.body.archive.public_verified===true);
 }else{const status=await call({action:'status',season_code:fixture.seasonCode});check('existing archive reverified without new reservation',status.status===200&&status.body.archive.public_verified===true)}
 state=await rpc('get_season_archive_status',{p_season_code:fixture.seasonCode});check('remote archive state published',state.state==='published');
 const loaded=await rpc('get_admin_dataset',{p_season_code:fixture.seasonCode}),r=loaded.results.find(x=>x.match_code===fixture.matchCode);
 const denied=await client.rpc('save_match_result',{p_match_code:fixture.matchCode,p_home_score:2,p_away_score:1,p_note:'合成測試：此操作應被拒絕',p_expected_version:r.version});check('post-archive authenticated score write denied',denied.error?.code==='55000');
 const insertDenied=await client.rpc('save_match',{p_season_code:fixture.seasonCode,p_match_code:fixture.matchCode+'-blocked',p_group:'A',p_date:'2026-01-02',p_time:'10:00',p_home_team_code:fixture.teams[0],p_away_team_code:fixture.teams[1],p_venue:'',p_status:'scheduled',p_published:true,p_expected_version:0});check('post-archive new match denied',insertDenied.error?.code==='55000');
 const catalogResponse=await fetch(url+'/functions/v1/season-archives?season='+fixture.seasonCode);const catalog=await catalogResponse.json();check('anonymous catalog reads verified archive',catalogResponse.ok&&catalog.archives?.length===1);
 const item=catalog.archives[0],raw=await(await fetch(url+'/storage/v1/object/public/wuri-season-archives/'+item.objectPath)).json();await D.normalizeArchive(raw,{environment:'test',projectRef:'vppjcjfbcoxzofcuxmzz'});check('public immutable object hash and whitelist verified',raw.contentHash===item.contentHash&&raw.content.league.roster.length===0);
 const final=await rpc('get_admin_dataset',{p_season_code:fixture.seasonCode});check('denied writes left synthetic data unchanged',final.matches.length===1&&final.results[0].home_score===3&&final.results[0].away_score===0);
 const acceptance=await rpc('get_season_archive_status',{p_season_code:fixtures.find(x=>x.kind==='acceptance').seasonCode});check('human acceptance season not sealed',acceptance.state==='live');
 const evidence={checksPassed:checks.length,checks,fixtureSeason:fixture.seasonCode,publishedArchiveId:item.archiveId,contentHash:item.contentHash,acceptanceSeason:fixtures.find(x=>x.kind==='acceptance').seasonCode,retainedSyntheticSeasons:2,productionTouched:false};
 fs.writeFileSync(process.argv[3],JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));await client.auth.signOut({scope:'local'});
})().catch(e=>{console.error(e.message);process.exitCode=1});

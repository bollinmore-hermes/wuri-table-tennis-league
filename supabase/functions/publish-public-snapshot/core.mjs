import {contentHash,HASH_ALGORITHM} from '../_shared/public-content.mjs';
export const TARGETS=Object.freeze({
 test:{projectRef:'vppjcjfbcoxzofcuxmzz',repo:'bollinmore-hermes/wuri-table-tennis-league-test',site:'https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/'},
 production:{projectRef:'zofiiibgnjuodgrzhkpn',repo:'bollinmore-hermes/wuri-table-tennis-league',site:'https://bollinmore-hermes.github.io/wuri-table-tennis-league/'}
});
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export function parseCommand(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['action','request_id'].includes(key))||!['publish','status','state'].includes(value.action))throw new Error('invalid_request');
 if(value.action!=='status'&&value.request_id!==undefined)throw new Error('invalid_request');
 if(value.request_id!==undefined&&!UUID.test(value.request_id))throw new Error('invalid_request');return value;
}
export function verifyManifest(value,environment){
 const target=TARGETS[environment];
 if(!target||value?.schemaVersion!==1||value.environment!==environment||value.projectRef!==target.projectRef||!/^[a-f0-9]{40}$/.test(value.sourceCommit||''))throw new Error('release_unavailable');
 if(environment==='production'&&!/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value.sourceTag||''))throw new Error('release_unavailable');
 return {sourceCommit:value.sourceCommit,sourceTag:value.sourceTag||null};
}
export async function handlePublication(request,{environment,supabaseUrl,githubToken,userClient,serviceClient,fetcher=fetch}){
 const origin=request.headers.get('origin')||'';
 const allowed=origin==='https://bollinmore-hermes.github.io';
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
 if(allowed)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'});
 const reply=(status,body)=>new Response(status===204?null:JSON.stringify(body),{status,headers});
 if(!allowed)return reply(403,{error:'origin_not_allowed'});
 if(request.method==='OPTIONS')return reply(204,{});
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
 const target=TARGETS[environment];if(!target||supabaseUrl!==`https://${target.projectRef}.supabase.co`)return reply(503,{error:'server_not_configured'});
 const authorization=request.headers.get('authorization')||'';
 const token=authorization.replace(/^Bearer\s+/i,'');if(!token||token===authorization)return reply(401,{error:'authentication_required'});
 const {data:auth,error:authError}=await userClient.auth.getUser(token);
 if(authError||!auth?.user)return reply(401,{error:'invalid_session'});
 const {data:profile,error:profileError}=await serviceClient.from('profiles').select('role,active').eq('id',auth.user.id).maybeSingle();
 if(profileError)return reply(503,{error:'authorization_check_failed'});
 if(profile?.role!=='admin'||profile.active!==true)return reply(403,{error:'admin_role_required'});
 let command;try{if(Number(request.headers.get('content-length')||0)>2048)throw new Error();const text=await request.text();if(text.length>2048)throw new Error();command=parseCommand(JSON.parse(text))}catch{return reply(400,{error:'invalid_request'})}
 if(command.action==='state'){
  try{
   const {data:s,error}=await serviceClient.rpc('get_publication_status_summary',{p_season_code:'2026-autumn-second-half'});
   if(error||!s||s.verified_hash_known!==true||typeof s.needs_publish!=='boolean')return reply(503,{error:'publication_state_unavailable'});
   const pending=s.pending_request_id, cooling=Number.isFinite(Date.parse(s.cooldown_until))&&Date.parse(s.cooldown_until)>Date.now();
   const status=pending?(['queued','running','dispatch_unknown'].includes(s.pending_status)?s.pending_status:'dispatch_unknown'):!s.needs_publish?'synced':!githubToken?'not_configured':cooling?'cooldown':'dirty';
   return reply(200,{status,can_publish:status==='dirty',needs_publish:s.needs_publish,pending_request_id:pending||null,last_published_at:s.last_published_at||null,cooldown_until:s.cooldown_until||null,automatic_enabled:s.automatic_enabled===true,automatic_interval_seconds:Number.isInteger(s.interval_seconds)?s.interval_seconds:null});
  }catch{return reply(503,{error:'publication_state_unavailable'})}
 }
 if(!githubToken)return reply(503,{error:'publication_not_configured'});
 const response=await executePublication(command,{environment,githubToken,serviceClient,fetcher,actorId:auth.user.id});
 return new Response(response.body,{status:response.status,headers:{...Object.fromEntries(response.headers),...headers}});
}
export async function executePublication(command,{environment,githubToken,serviceClient,fetcher=fetch,actorId=null,automatic=false,seasonCode='2026-autumn-second-half'}){
 const target=TARGETS[environment];
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!target||!githubToken)return reply(503,{error:'publication_not_configured'});
 const ghHeaders={Authorization:`Bearer ${githubToken}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
 const workflow='refresh-public-snapshot.yml';
 const gh=async(path,options={})=>{
  const response=await fetcher(`https://api.github.com/repos/${target.repo}/${path}`,{...options,headers:ghHeaders,redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('github_unavailable');return response.status===204?null:response.json();
 };
 const publicJSON=async(file)=>{
  const response=await fetcher(`${target.site}${file}?publication=${Date.now()}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('release_unavailable');const text=await response.text();if(text.length>2000000)throw new Error('release_unavailable');return JSON.parse(text);
 };
 const update=async(id,value)=>{const {error}=await serviceClient.from('snapshot_publications').update(value).eq('id',id);if(error)throw new Error('publication_state_unavailable')};
 try{
  if(command.action==='publish'){
   const baseline=verifyManifest(await publicJSON('release-manifest.json'),environment);
   await gh(`actions/workflows/${workflow}`);
   const {data:row,error}=await serviceClient.rpc(automatic?'reserve_automatic_public_snapshot':'reserve_public_snapshot',automatic?{p_season_code:seasonCode,p_source_commit:baseline.sourceCommit,p_source_tag:baseline.sourceTag}:{p_actor_id:actorId,p_source_commit:baseline.sourceCommit,p_source_tag:baseline.sourceTag});
   if(error)return reply(error.code==='P0001'?429:503,{error:error.code==='P0001'?'publication_busy':'publication_state_unavailable'});
   if(!row)return reply(200,{status:'unchanged'});
   try{
    await gh(`actions/workflows/${workflow}/dispatches`,{method:'POST',body:JSON.stringify({ref:environment==='production'?baseline.sourceTag:'main',inputs:{request_id:row.id,expected_commit:row.source_commit,expected_tag:row.source_tag||''}})});
   }catch{
    await update(row.id,{status:'dispatch_unknown'});
    return reply(202,{request_id:row.id,status:'dispatch_unknown',message:'觸發結果待確認；請查詢狀態，不要重送'});
   }
   return reply(202,{request_id:row.id,status:'queued'});
  }
  let query=serviceClient.from('snapshot_publications').select('id,source_commit,source_tag,created_at,status,run_id,published_at,season_code,publication_mode');
  query=command.request_id?query.eq('id',command.request_id):query.order('created_at',{ascending:false}).limit(1);
  const {data:row,error}=await query.maybeSingle();if(error)return reply(503,{error:'publication_state_unavailable'});if(!row)return reply(200,{status:'idle'});
  if(row.status==='published')return reply(200,{request_id:row.id,status:'published',published_at:row.published_at});
  const wf=await gh(`actions/workflows/${workflow}`);
  const list=await gh(`actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=100`);
  const run=list.workflow_runs.find(item=>item.workflow_id===wf.id&&item.display_title===`Snapshot publication / ${row.id}`);
  if(!run)return reply(200,{request_id:row.id,status:row.status==='failed'?'failed':row.status==='dispatch_unknown'?'dispatch_unknown':'queued'});
  const runUrl=`https://github.com/${target.repo}/actions/runs/${run.id}`;
  if(run.status!=='completed'){await update(row.id,{run_id:run.id,status:'running'});return reply(200,{request_id:row.id,status:'running',run_url:runUrl})}
  if(run.conclusion!=='success'){await update(row.id,{run_id:run.id,status:'failed'});if(automatic)await serviceClient.rpc('record_snapshot_automation_failure',{p_season_code:seasonCode});return reply(200,{request_id:row.id,status:'failed',run_url:runUrl})}
  const live=await publicJSON('public-league.json');
  if(live.schemaVersion!==1||live.metadata?.requestId!==row.id||live.metadata?.sourceCommit!==row.source_commit||live.metadata?.sourceTag!==row.source_tag||live.metadata?.projectRef!==target.projectRef||live.metadata?.environment!==environment)return reply(200,{request_id:row.id,status:'verifying',run_url:runUrl});
  if(!Number.isFinite(Date.parse(live.metadata.generatedAt)))throw new Error('release_unavailable');
  if(live.metadata.contentHash!==undefined){
   if(live.metadata.hashAlgorithm!==HASH_ALGORITHM||!/^[a-f0-9]{64}$/.test(live.metadata.contentHash)||await contentHash(live.data)!==live.metadata.contentHash||live.metadata.seasonCode!==(row.season_code||seasonCode))throw new Error('invalid_content_hash');
   const {error:confirmedError}=await serviceClient.rpc('confirm_public_snapshot_hash',{p_request_id:row.id,p_season_code:live.metadata.seasonCode,p_content_hash:live.metadata.contentHash,p_source_commit:row.source_commit,p_source_tag:row.source_tag,p_published_at:live.metadata.generatedAt});if(confirmedError)throw new Error('publication_state_unavailable');
  }else if(automatic)throw new Error('hash_release_required');
  await update(row.id,{run_id:run.id,status:'published',published_at:live.metadata.generatedAt});
  return reply(200,{request_id:row.id,status:'published',published_at:live.metadata.generatedAt,run_url:runUrl});
 }catch{return reply(503,{error:'publication_unavailable',message:'發布或狀態查核暫時無法完成；比分不受影響，請勿重複發布'})}
}

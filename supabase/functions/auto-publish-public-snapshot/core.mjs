import {TARGETS,verifyManifest,executePublication} from '../publish-public-snapshot/core.mjs';
import {executeStoragePublication} from '../_shared/storage-publication.mjs';
import {contentHash,HASH_ALGORITHM} from '../_shared/public-content.mjs';
const SEASON='2026-autumn-second-half';
function equalSecret(a,b){if(!a||!b||a.length!==64||b.length!==64)return false;let mismatch=0;for(let i=0;i<64;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0;}
export async function handleAutomatic(request,{environment,supabaseUrl,cronSecret,githubToken,serviceClient,fetcher=fetch}){
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(request.headers.has('origin'))return reply(403,{error:'browser_origin_not_allowed'});
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
 if(!equalSecret(request.headers.get('X-Snapshot-Cron-Secret'),cronSecret))return reply(401,{error:'cron_authentication_required'});
 const target=TARGETS[environment];if(!target||supabaseUrl!==`https://${target.projectRef}.supabase.co`)return reply(503,{error:'server_not_configured'});
 try{const text=await request.text();if(text.length>2048||text.trim()!=='{}')return reply(400,{error:'invalid_request'});}catch{return reply(400,{error:'invalid_request'})}
 const rpc=async(name,args)=>{const {data,error}=await serviceClient.rpc(name,args);if(error)throw new Error('state_unavailable');return data;};
 try{
  let state=await rpc('automatic_public_snapshot_state',{p_season_code:SEASON});
  if(!state?.enabled)return reply(200,{status:'disabled'});
  if(!githubToken&&state.delivery_method!=='storage')return reply(503,{error:'server_not_configured'});
  const execute=command=>state.delivery_method==='storage'?executeStoragePublication(command,{environment,supabaseUrl,serviceClient,fetcher,automatic:true}):executePublication(command,{environment,githubToken,serviceClient,fetcher,automatic:true,seasonCode:SEASON});
  if(state.pending_id){
   const response=await execute({action:'status',request_id:state.pending_id});
   if(response.status!==200||(await response.clone().json()).status!=='published'){if(response.status>=500||(await response.clone().json()).status==='failed')await rpc('record_snapshot_automation_failure',{p_season_code:SEASON});return response;}
   // Confirmation can make newer edits dirty, including a revert to an earlier hash.
   // Read again after confirmation; never reuse the pre-confirmation comparison.
   state=await rpc('automatic_public_snapshot_state',{p_season_code:SEASON});
   if(!state?.enabled||state.pending_id||!state.needs_publish||!state.retry_allowed)return response;
   // At most one follow-up reservation; the same DB lock still guards concurrency.
  }
  if(!state.needs_publish)return reply(200,{status:'unchanged'});
  if(!state.retry_allowed)return reply(200,{status:'retry_paused'});
  if(state.published_hash===null&&state.delivery_method!=='storage'){
   const read=async file=>{const r=await fetcher(`${target.site}${file}?automation=${Date.now()}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('release_unavailable');const text=await r.text();if(text.length>2000000)throw new Error('snapshot_too_large');return JSON.parse(text);};
   const manifest=verifyManifest(await read('release-manifest.json'),environment),live=await read('public-league.json'),m=live.metadata;
   if(live.schemaVersion!==1||m?.environment!==environment||m.projectRef!==target.projectRef||m.sourceCommit!==manifest.sourceCommit||m.sourceTag!==manifest.sourceTag||m.seasonCode!==SEASON||m.hashAlgorithm!==HASH_ALGORITHM||!/^[a-f0-9]{64}$/.test(m.contentHash||'')||await contentHash(live.data)!==m.contentHash||!Number.isFinite(Date.parse(m.generatedAt)))throw new Error('hash_release_required');
   // Bootstrap once from the actual verified live artifact, never from current DB state.
   await rpc('confirm_public_snapshot_hash',{p_request_id:null,p_season_code:SEASON,p_content_hash:m.contentHash,p_source_commit:m.sourceCommit,p_source_tag:m.sourceTag,p_published_at:m.generatedAt});
   state=await rpc('automatic_public_snapshot_state',{p_season_code:SEASON});if(!state.needs_publish)return reply(200,{status:'unchanged',bootstrapped:true});
  }
  const response=await execute({action:'publish'});
  if(response.status>=500||(await response.clone().json()).status==='failed')await rpc('record_snapshot_automation_failure',{p_season_code:SEASON});return response;
 }catch{await serviceClient.rpc('record_snapshot_automation_failure',{p_season_code:SEASON}).catch(()=>{});return reply(503,{error:'automatic_publication_unavailable'});}
}

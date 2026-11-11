import '../../../assets/js/league-repository.js';
import '../../../assets/js/season-archive-domain.js';
import {TARGETS} from '../_shared/publication-targets.mjs';
const R=globalThis.WuriLeagueRepository,D=globalThis.WuriSeasonArchive;
const ORIGIN='https://bollinmore-hermes.github.io',BUCKET='wuri-season-archives';
export async function handleSeasonArchives(request,{environment,supabaseUrl,userClient,serviceClient,fetcher=fetch}){
 const origin=request.headers.get('origin')||'',headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(origin===ORIGIN)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type'});
 const reply=(status,body)=>new Response(status===204?null:JSON.stringify(body),{status,headers});
 if(origin&&origin!==ORIGIN)return reply(403,{error:'origin_not_allowed'});
 if(request.method==='OPTIONS')return reply(204,{});
 const target=TARGETS[environment];if(!target||supabaseUrl!==`https://${target.projectRef}.supabase.co`)return reply(503,{error:'server_not_configured'});
 if(request.method==='GET'){
  const season=new URL(request.url).searchParams.get('season');if(season&&!D.CODE.test(season))return reply(400,{error:'invalid_season'});
  try{const {data,error}=await serviceClient.rpc('get_public_season_archives',{p_season_code:season});if(error||!Array.isArray(data))throw Error();
   const archives=data.map(x=>{if(!D.CODE.test(x.seasonCode)||!D.UUID.test(x.archiveId)||!D.HASH.test(x.contentHash)||x.objectPath!==`${x.seasonCode}/${x.archiveId}-${x.contentHash}.json`||typeof x.name!=='string'||x.name.length>200)throw Error();return {archiveId:x.archiveId,seasonCode:x.seasonCode,name:x.name,archivedAt:new Date(x.archivedAt).toISOString(),contentHash:x.contentHash,objectPath:x.objectPath,teamCount:x.teamCount,matchCount:x.matchCount}});
   return reply(200,{schemaVersion:1,environment,projectRef:target.projectRef,archives});
  }catch{return reply(503,{error:'archives_unavailable'})}
 }
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
 if(origin!==ORIGIN)return reply(403,{error:'origin_not_allowed'});
 const authorization=request.headers.get('authorization')||'';
 if(!/^Bearer \S+$/i.test(authorization))return reply(401,{error:'authentication_required'});
 let body;
 try{const raw=await request.text();if(new TextEncoder().encode(raw).length>100000)throw Error();body=JSON.parse(raw);if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['action','season_code','options','revision_hash','request_id'].includes(k))||!['archive','resume','status'].includes(body.action)||!D.CODE.test(body.season_code||''))throw Error()}catch{return reply(400,{error:'invalid_request'})}
 try{const {data,error}=await userClient.auth.getUser(authorization.slice(7));if(error||!data?.user)return reply(401,{error:'invalid_session'});const role=await userClient.rpc('get_my_profile');if(role.error||role.data?.role!=='admin'||role.data?.active!==true)return reply(403,{error:'admin_role_required'})}catch{return reply(401,{error:'invalid_session'})}
 let record;
 try{
  if(body.action==='archive'){
   const options=D.normalizeOptions(body.options);if(!D.HASH.test(body.revision_hash||'')||!D.UUID.test(body.request_id||''))return reply(400,{error:'invalid_request'});
   const readiness=await userClient.rpc('preview_season_archive',{p_season_code:body.season_code,p_options:options});
   // A lost successful reserve is recovered through status/resume, not a fresh
   // unchecked request. Validate the public schema before freezing any live data.
   if(readiness.error)return reply(400,{error:'archive_not_eligible'});
   if(readiness.data?.archive)return reply(409,{error:'preview_changed'});
   if(readiness.data?.revision_hash!==body.revision_hash)return reply(409,{error:'preview_changed'});
   if(!readiness.data?.eligible)return reply(400,{error:'archive_not_eligible'});
   try{D.validateContent(readiness.data.content)}catch{return reply(400,{error:'archive_not_eligible'})}
   const result=await userClient.rpc('reserve_season_archive',{p_season_code:body.season_code,p_options:options,p_expected_revision:body.revision_hash,p_request_id:body.request_id});
   if(result.error){const conflict=result.error.code==='PT409';return reply(conflict?409:400,{error:conflict?'preview_changed':'archive_not_eligible'})}record=result.data;
  }else{const result=await userClient.rpc('get_season_archive_status',{p_season_code:body.season_code});if(result.error)throw Error();record=result.data}
  if(record?.state==='live')return reply(200,{archive:{state:'live',public_verified:false}});
  if(!record||!D.UUID.test(record.id)||record.season_code!==body.season_code||!D.HASH.test(record.content_hash)||!['pending','published'].includes(record.state))throw Error();
  const envelope={schemaVersion:1,environment,projectRef:target.projectRef,seasonCode:record.season_code,archiveId:record.id,archivedAt:new Date(record.created_at).toISOString(),contentHash:record.content_hash,content:record.public_content};
  await D.normalizeArchive(envelope,{environment,projectRef:target.projectRef});
  const objectPath=`${record.season_code}/${record.id}-${record.content_hash}.json`,url=`${supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectPath}`;
  const state=(verified=false)=>({id:record.id,season_code:record.season_code,state:record.state,content_hash:record.content_hash,object_path:objectPath,public_verified:verified});
  const read=async()=>{try{const r=await fetcher(url+'?verify='+record.id+'&fresh='+Date.now(),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});if(r.status===404)return {kind:'missing'};if(r.status===400){const error=await r.json();return {kind:String(error.statusCode)==='404'?'missing':'unknown'}}if(!r.ok||r.redirected)return {kind:'unknown'};const text=await r.text();if(new TextEncoder().encode(text).length>2000000)return {kind:'mismatch'};const value=JSON.parse(text);await D.normalizeArchive(value,{environment,projectRef:target.projectRef});return {kind:R.canonicalPublicJSON(value)===R.canonicalPublicJSON(envelope)?'verified':'mismatch'}}catch{return {kind:'unknown'}}};
  let observed=await read();
  if(observed.kind==='missing'&&record.state==='pending'&&body.action!=='status'){
   // Explicit archive/resume only; never upsert. An unknown upload is resolved by
   // reading that exact immutable object, never by a second automatic upload.
   try{await serviceClient.storage.from(BUCKET).upload(objectPath,JSON.stringify(envelope),{contentType:'application/json',cacheControl:'31536000',upsert:false})}catch{}
   observed=await read();
  }
  if(observed.kind!=='verified')return reply(observed.kind==='mismatch'?409:202,{archive:state(false),error:observed.kind==='mismatch'?'archive_verification_failed':'publication_pending'});
  if(record.state!=='published'){
   const result=await serviceClient.rpc('confirm_season_archive',{p_id:record.id,p_hash:record.content_hash,p_object_path:objectPath});if(result.error)return reply(202,{archive:state(false),error:'confirmation_pending'});record.state='published';
  }
  return reply(200,{archive:state(true)});
 }catch{return reply(503,{error:'archive_status_unknown',message:'請查詢封存狀態，不要重複建立封存要求'})}
}

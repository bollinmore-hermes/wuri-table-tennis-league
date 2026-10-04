import {TARGETS,verifyManifest} from './publication-targets.mjs';
import {contentHash,sha256Text,verifySnapshotDigest,HASH_ALGORITHM} from './public-content.mjs';
const {toPublicDataset,normalizePublicSnapshot}=globalThis.WuriLeagueRepository;
export const STORAGE_BUCKET='wuri-public-snapshots',SEASON='2026-autumn-second-half';
const PATH=/^2026-autumn-second-half\/[a-f0-9]{40}\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}-[a-f0-9]{64}\.json$/;
export function publicObjectURL(url,path){if(!PATH.test(path))throw new Error('invalid object path');return `${url}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;}
export async function executeStoragePublication(command,{environment,supabaseUrl,serviceClient,fetcher=fetch,actorId=null,automatic=false}){
 const target=TARGETS[environment],reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!target||supabaseUrl!==`https://${target.projectRef}.supabase.co`)return reply(503,{error:'server_not_configured'});
 const rpc=async(name,args)=>{const {data,error}=await serviceClient.rpc(name,args);if(error){const e=new Error('state_unavailable');e.code=error.code;throw e}return data};
 const read=async url=>{const r=await fetcher(url,{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok||r.redirected||Number(r.headers.get('content-length')||0)>2000000)throw new Error('public_read_unavailable');const text=await r.text();if(new TextEncoder().encode(text).length>2000000)throw new Error('public_response_too_large');return JSON.parse(text)};
 const update=async(id,value)=>{const {error}=await serviceClient.from('snapshot_publications').update(value).eq('id',id);if(error)throw new Error('state_unavailable')};
 let row=null,writeStarted=false;
 try{
  if(command.action==='publish'){
   const manifest=verifyManifest(await read(target.site+'release-manifest.json?direct='+Date.now()),environment);
   row=await rpc('reserve_storage_public_snapshot',{p_season_code:SEASON,p_actor_id:actorId,p_automatic:automatic,p_source_commit:manifest.sourceCommit,p_source_tag:manifest.sourceTag});
   if(!row)return reply(200,{status:'unchanged'});
   const envelope=row.snapshot,data=toPublicDataset(envelope?.data);
   if(envelope.hashAlgorithm!==HASH_ALGORITHM||envelope.contentHash!==row.requested_hash||await contentHash(envelope.data)!==row.requested_hash||await contentHash(data)!==row.requested_hash)throw new Error('public_projection_hash_mismatch');
   const metadata={environment,projectRef:target.projectRef,seasonCode:SEASON,sourceCommit:row.source_commit,sourceTag:row.source_tag,generatedAt:new Date(row.created_at).toISOString(),requestId:row.id,contentHash:row.requested_hash,hashAlgorithm:HASH_ALGORITHM};
   metadata.snapshotId=await sha256Text(JSON.stringify({metadata,data}));
   const snapshot={schemaVersion:1,metadata,data};normalizePublicSnapshot(snapshot,metadata);await verifySnapshotDigest(snapshot);
   const body=JSON.stringify(snapshot);if(new TextEncoder().encode(body).length>2000000)throw new Error('snapshot_too_large');
   publicObjectURL(supabaseUrl,row.object_path);writeStarted=true;
   const {error}=await serviceClient.storage.from(STORAGE_BUCKET).upload(row.object_path,body,{contentType:'application/json',cacheControl:'31536000',upsert:false});
   if(error){const code=Number(error.statusCode||error.status);if([400,401,403,404,413,429].includes(code))writeStarted=false;throw new Error('storage_upload_unavailable')}
  }else if(command.action==='status'){
   let query=serviceClient.from('snapshot_publications').select('id,source_commit,source_tag,season_code,created_at,status,delivery_method,object_path,requested_hash,content_hash,snapshot_id,published_at');
   query=command.request_id?query.eq('id',command.request_id):query.order('created_at',{ascending:false}).limit(1);
   const {data,error}=await query.maybeSingle();if(error)throw new Error('state_unavailable');row=data;
   if(!row)return reply(200,{status:'idle'});
   if(row.status==='failed')return reply(200,{request_id:row.id,status:'failed'});
   if(row.status==='published')return reply(200,{request_id:row.id,status:'published',published_at:row.published_at});
   if(row.delivery_method!=='storage')return reply(503,{error:'legacy_publication_requires_reconciliation'});
   writeStarted=true; // A status query cannot know whether a lost upload response committed.
  }else return reply(400,{error:'invalid_request'});
  const live=await read(publicObjectURL(supabaseUrl,row.object_path)),m=live.metadata;
  const expected={environment,projectRef:target.projectRef,seasonCode:SEASON,sourceCommit:row.source_commit,sourceTag:row.source_tag};
  normalizePublicSnapshot(live,expected);await verifySnapshotDigest(live);
  if(m.requestId!==row.id||m.contentHash!==row.requested_hash||m.generatedAt!==new Date(row.created_at).toISOString())throw new Error('public_receipt_mismatch');
  const confirmed=await rpc('confirm_storage_public_snapshot',{p_request_id:row.id,p_content_hash:m.contentHash,p_snapshot_id:m.snapshotId,p_generated_at:m.generatedAt});
  if(confirmed?.status!=='published')throw new Error('confirmation_unavailable');row.status='published';
  const pointer=await rpc('get_storage_public_snapshot_pointer',{p_season_code:SEASON});
  if(pointer?.requestId!==row.id||pointer.contentHash!==m.contentHash||pointer.snapshotId!==m.snapshotId)throw new Error('pointer_unavailable');
  return reply(200,{request_id:row.id,status:'published',published_at:m.generatedAt,delivery_method:'storage'});
 }catch(error){
  if(!row)return reply(error.code==='P0001'?429:503,{error:error.code==='P0001'?'publication_busy':'publication_unavailable'});
  const status=writeStarted?'dispatch_unknown':'failed';
  // Never downgrade an already confirmed row when only the final pointer read failed.
  try{if(row.status!=='published')await update(row.id,{status})}catch{}
  return reply(writeStarted?202:200,{request_id:row.id,status,delivery_method:'storage'});
 }
}

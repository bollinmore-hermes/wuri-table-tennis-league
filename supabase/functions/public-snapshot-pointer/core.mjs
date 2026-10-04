import {TARGETS} from '../_shared/publication-targets.mjs';
import {SEASON} from '../_shared/storage-publication.mjs';
export async function handlePublicPointer(request,{environment,supabaseUrl,serviceClient}){
 const origin=request.headers.get('origin')||'',headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(origin==='https://bollinmore-hermes.github.io')Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'content-type'});
 const reply=(status,body)=>new Response(status===204?null:JSON.stringify(body),{status,headers});
 if(origin&&origin!=='https://bollinmore-hermes.github.io')return reply(403,{error:'origin_not_allowed'});
 if(request.method==='OPTIONS')return reply(204,{});if(request.method!=='GET')return reply(405,{error:'method_not_allowed'});
 const target=TARGETS[environment];if(!target||supabaseUrl!==`https://${target.projectRef}.supabase.co`)return reply(503,{error:'server_not_configured'});
 try{const {data,error}=await serviceClient.rpc('get_storage_public_snapshot_pointer',{p_season_code:SEASON});if(error||!data)return reply(503,{error:'snapshot_unavailable'});return reply(200,{...data,generatedAt:new Date(data.generatedAt).toISOString()})}catch{return reply(503,{error:'snapshot_unavailable'})}
}

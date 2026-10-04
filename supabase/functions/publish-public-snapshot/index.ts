import {createClient} from 'npm:@supabase/supabase-js@2';
import {handlePublication,TARGETS} from './core.mjs';
Deno.serve(async request=>{
 const url=Deno.env.get('SUPABASE_URL')||'',environment=Object.keys(TARGETS).find(key=>url===`https://${TARGETS[key].projectRef}.supabase.co`);
 const anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!environment||!anon||!service)return new Response(JSON.stringify({error:'server_not_configured'}),{status:503,headers:{'Content-Type':'application/json'}});
 const serviceClient=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 return handlePublication(request,{environment,supabaseUrl:url,githubToken:Deno.env.get('SNAPSHOT_GITHUB_TOKEN')||'',userClient:createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}}),serviceClient,getDelivery:async()=>{const {data,error}=await serviceClient.rpc('snapshot_publication_delivery',{p_season_code:'2026-autumn-second-half'});if(error)throw error;return data}});
});

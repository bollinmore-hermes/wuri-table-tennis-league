import {createClient} from 'npm:@supabase/supabase-js@2';
import {TARGETS} from '../_shared/publication-targets.mjs';
import {handleSeasonArchives} from './core.mjs';
Deno.serve(request=>{
 const url=Deno.env.get('SUPABASE_URL')||'',environment=Object.keys(TARGETS).find(key=>url===`https://${TARGETS[key].projectRef}.supabase.co`),anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!environment||!anon||!service)return new Response(JSON.stringify({error:'server_not_configured'}),{status:503,headers:{'Content-Type':'application/json'}});
 return handleSeasonArchives(request,{environment,supabaseUrl:url,
 userClient:createClient(url,anon,{global:{headers:{Authorization:request.headers.get('authorization')||''}},auth:{persistSession:false,autoRefreshToken:false}}),
 serviceClient:createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})});
});

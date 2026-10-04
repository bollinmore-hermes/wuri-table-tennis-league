import {createClient} from 'npm:@supabase/supabase-js@2';
import {TARGETS} from '../_shared/publication-targets.mjs';
import {handlePublicPointer} from './core.mjs';
Deno.serve(request=>{
 const url=Deno.env.get('SUPABASE_URL')||'',environment=Object.keys(TARGETS).find(key=>url===`https://${TARGETS[key].projectRef}.supabase.co`);
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!key)return new Response(JSON.stringify({error:'server_not_configured'}),{status:503});
 return handlePublicPointer(request,{environment,supabaseUrl:url,serviceClient:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})});
});

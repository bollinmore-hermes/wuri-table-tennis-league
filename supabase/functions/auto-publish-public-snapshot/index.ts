import {createClient} from 'npm:@supabase/supabase-js@2';
import {TARGETS} from '../publish-public-snapshot/core.mjs';
import {handleAutomatic} from './core.mjs';
Deno.serve(request=>{
 const url=Deno.env.get('SUPABASE_URL')||'',environment=Object.keys(TARGETS).find(key=>url===`https://${TARGETS[key].projectRef}.supabase.co`);
 return handleAutomatic(request,{environment,supabaseUrl:url,cronSecret:Deno.env.get('SNAPSHOT_CRON_SECRET')||'',githubToken:Deno.env.get('SNAPSHOT_GITHUB_TOKEN')||'',serviceClient:createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}})});
});

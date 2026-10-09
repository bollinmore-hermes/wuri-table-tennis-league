'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cli=path.join(root,'node_modules/.bin/supabase'),source=fs.readFileSync(path.join(root,'scripts/verify-daily-reporting.sql'),'utf8');
const mutation=`do $mutation$ declare definition text; begin
select pg_get_functiondef('public.get_result_review_queue(text)'::regprocedure) into definition;
if position('role_name is null or role_name not in' in definition)=0 then raise exception 'mutation target absent';end if;
execute replace(definition,'role_name is null or role_name not in','role_name not in');end $mutation$;\n`;
const file=path.join(root,'.private/authorization-mutation.sql');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source.replace('do $$\n#variable_conflict',()=>mutation+'do $$\n#variable_conflict'));
const run=f=>spawnSync(cli,['db','query','--linked','--project-ref','vppjcjfbcoxzofcuxmzz','--file',f],{cwd:root,encoding:'utf8'}),bad=run(file);
if(bad.status===0||!(bad.stdout+bad.stderr).includes('expected rejection missing: permission denied')){fs.writeFileSync(path.join(root,'.private/authorization-mutation-error.txt'),(bad.stdout+bad.stderr).replace(/[a-f0-9]{64}/g,'[redacted]'),{mode:0o600});throw Error('NULL-unsafe guard mutation was not detected; sanitized diagnostic saved in .private/authorization-mutation-error.txt')}
const clean=run(path.join(root,'scripts/verify-daily-reporting.sql'));if(clean.status!==0||!clean.stdout.includes('"ok": true'))throw Error('Clean remote guards did not pass after rollback');
const evidence={ok:true,projectRef:'vppjcjfbcoxzofcuxmzz',mutation:'queue guard replaced with NULL-unsafe predicate within transaction',regressionDetected:true,mutationTransactionRolledBack:true,originalRemoteVerificationPass:true,notProduction:true};fs.writeFileSync(path.join(root,'docs/evidence/issue-53/authorization-mutation.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));

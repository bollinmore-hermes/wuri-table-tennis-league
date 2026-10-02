'use strict';
// Embedded PostgreSQL verification; Auth helpers are explicitly emulated.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const {prepare,mask,publicProjection}=require('./prepare-private-rosters.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite();const checks=[];
 const admin='10000000-0000-0000-0000-000000000001',scorer='10000000-0000-0000-0000-000000000002',inactive='10000000-0000-0000-0000-000000000003',unprofiled='10000000-0000-0000-0000-000000000004';
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;grant usage on schema auth,public to anon,authenticated,service_role;`);
 await db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.extension(name text) returns text language sql immutable as $$ select substring(name from '\\.[^.]+$') $$;`);
 for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(file=>file.endsWith('.sql')).sort()){
  const sql=fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8').replace(/create extension if not exists pgcrypto;/gi,'-- Embedded PostgreSQL provides gen_random_uuid natively.');
  await db.exec(sql);checks.push(`migration:${file}`);
 }
 await db.exec(fs.readFileSync(path.join(root,'supabase/seed.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/seed-official.sql'),'utf8'));
 for(const [id,role,active] of [[admin,'admin',true],[scorer,'scorer',true],[inactive,'admin',false],[unprofiled,null,true]]){
  await db.query('insert into auth.users(id,email) values($1,$2)',[id,`fixture-${role||'none'}-${active}@example.invalid`]);
  if(role)await db.query('insert into public.profiles(id,role,active) values($1,$2,$3)',[id,role,active]);
 }
 const as=async(role,id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.query("select set_config('request.jwt.claim.role',$1,false)",[role]);await db.exec(`set role ${role}`)};
 const season='2026-autumn-second-half';
 const rpc=async(name,args)=> (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;
 const deny=async(fn,code)=>{await assert.rejects(fn,error=>error.code===code);};
 let source;
 if(process.env.PRIVATE_ROSTER_FILE)source=JSON.parse(fs.readFileSync(process.env.PRIVATE_ROSTER_FILE,'utf8'));
 else source={season_code:season,teams:require('../assets/js/official-data.js').teams.map(team=>({team_code:team.team_code,leader:'測試甲',players:['測試乙','測試丙']}))};
 const payload=prepare(source),fullNames=payload.flatMap(team=>team.members.map(member=>member.name));
 await as('authenticated',admin);
 const first=await rpc('import_team_rosters',[season,JSON.stringify(payload)]);
 assert.equal(first.changed,fullNames.length);checks.push('admin-import');
 const adminData=await rpc('get_admin_dataset',[season]);assert.equal(adminData.players.length,fullNames.length);assert.deepEqual(adminData.players.map(p=>p.name).sort(),fullNames.slice().sort());checks.push('admin-full-names');
 const second=await rpc('import_team_rosters',[season,JSON.stringify(payload)]);assert.equal(second.changed,0);checks.push('idempotent-import');
 const count=async()=>Number((await db.query('select count(*) as n from public.players')).rows[0].n);
 await as('authenticated',scorer);const scorerData=await rpc('get_admin_dataset',[season]);assert.deepEqual(scorerData.players,[]);assert.deepEqual(scorerData.audits,[]);checks.push('scorer-no-private-data');
 await deny(()=>rpc('import_team_rosters',[season,JSON.stringify(payload)]),'42501');
 await deny(()=>rpc('save_player',[null,'A01','測試丁','active',0,'player',50,true,season]),'42501');
 await deny(()=>db.query('select * from public.players'),'42501');checks.push('scorer-write-and-table-denial');
 for(const id of [inactive,unprofiled]){await as('authenticated',id);await deny(()=>rpc('get_admin_dataset',[season]),'42501');await deny(()=>rpc('import_team_rosters',[season,JSON.stringify(payload)]),'42501');}checks.push('inactive-and-unprofiled-denial');
 await as('anon',null);await deny(()=>rpc('get_admin_dataset',[season]),'42501');await deny(()=>rpc('import_team_rosters',[season,JSON.stringify(payload)]),'42501');await deny(()=>db.query('select * from public.players'),'42501');checks.push('anonymous-denial');
 const publicData=await rpc('get_public_league',[season]);
 assert.equal(publicData.roster.length,fullNames.length);assert.deepEqual(publicData.roster,publicProjection(payload).sort((a,b)=>a.team_code.localeCompare(b.team_code)||(a.roster_role==='leader'?0:1)-(b.roster_role==='leader'?0:1)||a.display_order-b.display_order));
 assert(fullNames.every(name=>!JSON.stringify(publicData).includes(name)));checks.push('server-masked-public-response');
 if(process.env.PRIVATE_ROSTER_FILE)assert.deepEqual(publicData.roster,require('../assets/js/official-data.js').roster.slice().sort((a,b)=>a.team_code.localeCompare(b.team_code)||(a.roster_role==='leader'?0:1)-(b.roster_role==='leader'?0:1)||a.display_order-b.display_order));
 assert.deepEqual((await rpc('get_public_league',['unknown-season'])).roster,[]);checks.push('unknown-season-empty');
 await as('authenticated',admin);await deny(()=>db.query('select * from public.players'),'42501');checks.push('admin-direct-table-denial');
 const player=adminData.players.find(p=>p.roster_role==='player');
 await rpc('save_player',[player.id,player.team_code,player.name,'active',player.version,player.roster_role,player.display_order,false,season]);
 await as('anon',null);assert.equal((await rpc('get_public_league',[season])).roster.length,fullNames.length-1);checks.push('unpublished-member-excluded');
 await as('authenticated',admin);const fresh=(await rpc('get_admin_dataset',[season])).players.find(p=>p.id===player.id);
 await rpc('disable_player',[fresh.id,fresh.version]);await as('anon',null);assert.equal((await rpc('get_public_league',[season])).roster.length,fullNames.length-1);checks.push('soft-deleted-member-excluded');
 await as('authenticated',admin);
 await assert.rejects(()=>rpc('save_player',[null,'A01','測丁','active',0,'player',50,true,season]));checks.push('short-name-publication-denied');
 const bad=[{team_code:'A01',members:[{name:'測試丁',roster_role:'player',display_order:50}]},{team_code:'UNKNOWN',members:[{name:'測試戊',roster_role:'player',display_order:50}]}];
 await assert.rejects(()=>rpc('import_team_rosters',[season,JSON.stringify(bad)]));
 await db.exec('reset role');assert.equal(await count(),fullNames.length);assert.equal((await db.query("select count(*)::int as n from public.players where name='測試丁'")).rows[0].n,0);checks.push('transaction-rollback');
 assert.equal((await db.query("select public.mask_roster_name('測試甲乙') as n")).rows[0].n,mask('測試甲乙'));checks.push('mask-parity');
 if(process.env.MUTATE_SCORER_GUARD){
  const original=fs.readFileSync(path.join(root,'supabase/migrations/009_private_rosters.sql'),'utf8');
  const fn=original.match(/create or replace function public.get_admin_dataset[\s\S]*?end \$\$;/)[0].replace("'players',case when app_role='admin' then coalesce(","'players',case when app_role in ('admin','scorer') then coalesce(");
  await db.exec(fn);await as('authenticated',scorer);assert.deepEqual((await rpc('get_admin_dataset',[season])).players,[]);
 }
 await db.close();console.log(JSON.stringify({ok:true,runtime:'PGlite embedded PostgreSQL',auth:'emulated uid/roles; remote Auth and PostgREST unverified',members:fullNames.length,teams:payload.length,checks},null,2));
})().catch(error=>{console.error(JSON.stringify({ok:false,code:error.code||null,error:process.env.PRIVATE_ROSTER_FILE?'Private-data verification failed; inspect using synthetic fixtures':process.env.MUTATE_SCORER_GUARD?'Authorization mutation correctly rejected by assertion':error.message}));process.exitCode=1});

-- Test management backend contract. Apply after 001-003; do not edit historical migrations.
-- Runtime RLS verification requires a dedicated Supabase Test project.

alter table public.teams add column if not exists description text not null default '';
alter table public.teams add column if not exists logo_path text not null default '';
alter table public.teams add column if not exists version integer not null default 1;
alter table public.teams add column if not exists updated_by uuid references auth.users(id);
alter table public.teams add column if not exists updated_at timestamptz not null default now();
alter table public.matches add column if not exists published boolean not null default false;
alter table public.matches add column if not exists locked boolean not null default false;
alter table public.matches add column if not exists version integer not null default 1;
alter table public.matches add column if not exists updated_by uuid references auth.users(id);
alter table public.matches add column if not exists updated_at timestamptz not null default now();
alter table public.match_results add column if not exists published boolean not null default false;
alter table public.match_results add column if not exists locked boolean not null default false;
alter table public.match_results add column if not exists version integer not null default 1;
alter table public.match_results add column if not exists updated_by uuid references auth.users(id);
alter table public.match_results add column if not exists updated_at timestamptz not null default now();
alter table public.season_teams add column if not exists display_name text not null default '';
alter table public.season_teams add column if not exists display_order integer not null default 0;
alter table public.season_teams add column if not exists active boolean not null default true;

do $$ begin
  alter table public.teams add constraint teams_version_positive check (version > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.matches add constraint matches_version_positive check (version > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.match_results add constraint match_results_version_positive check (version > 0);
exception when duplicate_object then null; end $$;

-- Browser clients cannot select base tables. Public data is exposed only through the curated RPC below.
revoke all on table public.seasons,public.groups,public.teams,public.season_teams,public.matches,public.match_results,public.standings_snapshots,public.profiles,public.audit_logs from anon;
revoke all on table public.seasons,public.groups,public.teams,public.season_teams,public.matches,public.match_results,public.standings_snapshots,public.profiles,public.audit_logs from authenticated;

drop function if exists public.get_public_league(text);
create function public.get_public_league(p_season_code text) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare sid uuid; result jsonb;
begin
  if p_season_code is null or p_season_code !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then raise exception 'invalid season code'; end if;
  select s.id into sid from public.seasons s where s.code=p_season_code and s.status='active';
  if sid is null then return jsonb_build_object('season',null,'teams','[]'::jsonb,'matches','[]'::jsonb,'results','[]'::jsonb,'snapshots','[]'::jsonb); end if;
  select jsonb_build_object(
    'season',jsonb_build_object('code',s.code,'name',s.name,'start_date',s.start_date,'end_date',s.end_date),
    'teams',coalesce((select jsonb_agg(jsonb_build_object('team_code',t.team_code,'name',coalesce(nullif(st.display_name,''),t.name),'short_name',t.short_name,'group',g.code,'display_order',st.display_order,'description',t.description,'logo_path',t.logo_path,'active',true) order by g.display_order,st.display_order,t.team_code) from public.season_teams st join public.teams t on t.id=st.team_id join public.groups g on g.id=st.group_id where st.season_id=sid and st.active and t.active),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'group',g.code,'date',m.match_date,'time',to_char(m.match_time,'HH24:MI'),'home_team_code',ht.team_code,'away_team_code',at.team_code,'venue',m.venue,'status',case when exists(select 1 from public.match_results pr where pr.match_id=m.id and pr.published) then 'final' when m.status='final' then 'scheduled' else m.status end) order by m.match_date,m.match_time,m.match_code) from public.matches m join public.groups g on g.id=m.group_id join public.teams ht on ht.id=m.home_team_id join public.teams at on at.id=m.away_team_id where m.season_id=sid and m.published),'[]'::jsonb),
    'results',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'home_score',r.home_score,'away_score',r.away_score,'status','final') order by m.match_code) from public.match_results r join public.matches m on m.id=r.match_id where m.season_id=sid and m.published and r.published),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(jsonb_build_object('group',g.code,'snapshot_date',ss.snapshot_date,'team_code',t.team_code,'points',ss.points,'wins',ss.wins,'losses',ss.losses,'rank',ss.rank,'rank_change',ss.rank_change) order by ss.snapshot_date,g.code,ss.rank) from public.standings_snapshots ss join public.groups g on g.id=ss.group_id join public.teams t on t.id=ss.team_id where ss.season_id=sid),'[]'::jsonb)
  ) into result from public.seasons s where s.id=sid;
  return result;
end $$;
revoke all on function public.get_public_league(text) from public;
grant execute on function public.get_public_league(text) to anon,authenticated;

create or replace function public.get_my_profile() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select jsonb_build_object('display_name',p.display_name,'role',p.role,'active',p.active) into result from public.profiles p where p.id=auth.uid() and p.active and p.role in ('admin','scorer');
  if result is null then raise exception 'profile role required' using errcode='42501'; end if;
  return result;
end $$;

drop function if exists public.get_admin_dataset();
create function public.get_admin_dataset(p_season_code text default '2026-autumn-second-half') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; sid uuid; result jsonb;
begin
  select public.current_app_role() into app_role;
  if app_role is null or app_role not in ('admin','scorer') then raise exception 'permission denied' using errcode='42501'; end if;
  select s.id into sid from public.seasons s where s.code=p_season_code;
  if sid is null then raise exception 'season not initialized'; end if;
  select jsonb_build_object(
    'teams',coalesce((select jsonb_agg(jsonb_build_object('team_code',t.team_code,'name',t.name,'short_name',t.short_name,'description',t.description,'logo_path',t.logo_path,'group',g.code,'display_name',st.display_name,'display_order',st.display_order,'active',t.active and st.active,'version',t.version) order by g.code,st.display_order,t.team_code) from public.teams t join public.season_teams st on st.team_id=t.id join public.groups g on g.id=st.group_id where st.season_id=sid),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'group',g.code,'date',m.match_date,'time',to_char(m.match_time,'HH24:MI'),'home_team_code',ht.team_code,'away_team_code',at.team_code,'venue',m.venue,'status',m.status,'published',m.published,'locked',m.locked,'version',m.version) order by m.match_date,m.match_time,m.match_code) from public.matches m join public.groups g on g.id=m.group_id join public.teams ht on ht.id=m.home_team_id join public.teams at on at.id=m.away_team_id where m.season_id=sid),'[]'::jsonb),
    'results',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'home_score',r.home_score,'away_score',r.away_score,'note',r.note,'published',r.published,'locked',r.locked,'version',r.version) order by m.match_code) from public.match_results r join public.matches m on m.id=r.match_id where m.season_id=sid),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(jsonb_build_object('group',g.code,'snapshot_date',ss.snapshot_date,'team_code',t.team_code,'points',ss.points,'wins',ss.wins,'losses',ss.losses,'rank',ss.rank,'rank_change',ss.rank_change)) from public.standings_snapshots ss join public.groups g on g.id=ss.group_id join public.teams t on t.id=ss.team_id where ss.season_id=sid),'[]'::jsonb),
    'audits',case when app_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'detail',a.detail,'created_at',a.created_at,'user_id',a.user_id) order by a.created_at desc) from (select * from public.audit_logs order by created_at desc limit 100) a),'[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end $$;

create or replace function public.create_team(p_season_code text,p_team_code text,p_name text,p_short_name text,p_group text,p_description text default '',p_logo_path text default '',p_display_name text default '',p_display_order integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; sid uuid; gid uuid; tid uuid; after_row jsonb;
begin
  select public.current_app_role() into app_role; if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_team_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$' or p_group not in ('A','B') or char_length(p_name) not between 1 and 100 or char_length(p_short_name) not between 1 and 30 or char_length(coalesce(p_description,''))>1000 or char_length(coalesce(p_logo_path,''))>300 or p_display_order not between 0 and 100 then raise exception 'invalid team input'; end if;
  select s.id into sid from public.seasons s where s.code=p_season_code; select g.id into gid from public.groups g where g.season_id=sid and g.code=p_group; if sid is null or gid is null then raise exception 'unknown season or group'; end if;
  insert into public.teams(team_code,name,short_name,description,logo_path,updated_by) values(p_team_code,p_name,p_short_name,coalesce(p_description,''),coalesce(p_logo_path,''),auth.uid()) returning id into tid;
  insert into public.season_teams(season_id,team_id,group_id,display_name,display_order) values(sid,tid,gid,coalesce(p_display_name,''),p_display_order);
  after_row=jsonb_build_object('team_code',p_team_code,'version',1); insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'create_team',p_team_code,after_row); return after_row;
end $$;

create or replace function public.update_team(p_team_code text,p_expected_version integer,p_name text,p_short_name text,p_description text default '',p_logo_path text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; before_row jsonb; after_row jsonb;
begin
  select public.current_app_role() into app_role; if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_expected_version<1 or char_length(p_name) not between 1 and 100 or char_length(p_short_name) not between 1 and 30 or char_length(coalesce(p_description,''))>1000 or char_length(coalesce(p_logo_path,''))>300 then raise exception 'invalid team input'; end if;
  select to_jsonb(t) into before_row from public.teams t where t.team_code=p_team_code;
  update public.teams set name=p_name,short_name=p_short_name,description=coalesce(p_description,''),logo_path=coalesce(p_logo_path,''),version=version+1,updated_by=auth.uid(),updated_at=now() where team_code=p_team_code and version=p_expected_version returning jsonb_build_object('team_code',team_code,'version',version) into after_row;
  if after_row is null then raise exception 'version conflict' using errcode='40001'; end if;
  insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'update_team',p_team_code,before_row,after_row); return after_row;
end $$;

create or replace function public.disable_team(p_team_code text,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; after_row jsonb;
begin
  select public.current_app_role() into app_role; if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  update public.teams set active=false,version=version+1,updated_by=auth.uid(),updated_at=now() where team_code=p_team_code and version=p_expected_version returning jsonb_build_object('team_code',team_code,'version',version,'active',active) into after_row;
  if after_row is null then raise exception 'version conflict' using errcode='40001'; end if;
  insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'disable_team',p_team_code,after_row); return after_row;
end $$;

create or replace function public.create_match(p_season_code text,p_match_code text,p_group text,p_date date,p_time time,p_home_team_code text,p_away_team_code text,p_venue text default '',p_published boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; sid uuid; gid uuid; hid uuid; aid uuid; out_row jsonb;
begin
  select public.current_app_role() into app_role; if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_match_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' or p_group not in ('A','B') or p_home_team_code=p_away_team_code or char_length(coalesce(p_venue,''))>200 then raise exception 'invalid match input'; end if;
  select s.id into sid from public.seasons s where s.code=p_season_code;
  select g.id into gid from public.groups g where g.season_id=sid and g.code=p_group;
  select st.team_id into hid from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.group_id=gid and st.active and t.active and t.team_code=p_home_team_code;
  select st.team_id into aid from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.group_id=gid and st.active and t.active and t.team_code=p_away_team_code;
  if sid is null or gid is null or hid is null or aid is null then raise exception 'invalid match reference'; end if;
  insert into public.matches(season_id,group_id,match_code,match_date,match_time,home_team_id,away_team_id,venue,published,updated_by) values(sid,gid,p_match_code,p_date,p_time,hid,aid,coalesce(p_venue,''),p_published,auth.uid()) returning jsonb_build_object('match_code',match_code,'version',version) into out_row;
  insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'create_match',p_match_code,out_row); return out_row;
end $$;

create or replace function public.update_match(p_match_code text,p_expected_version integer,p_date date,p_time time,p_home_team_code text,p_away_team_code text,p_venue text default '',p_published boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; sid uuid; gid uuid; hid uuid; aid uuid; before_row jsonb; out_row jsonb;
begin
  select public.current_app_role() into app_role; if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_expected_version<1 or p_home_team_code=p_away_team_code or char_length(coalesce(p_venue,''))>200 then raise exception 'invalid match input'; end if;
  select m.season_id,m.group_id,to_jsonb(m) into sid,gid,before_row from public.matches m where m.match_code=p_match_code;
  select st.team_id into hid from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.group_id=gid and st.active and t.active and t.team_code=p_home_team_code;
  select st.team_id into aid from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.group_id=gid and st.active and t.active and t.team_code=p_away_team_code;
  if sid is null or hid is null or aid is null then raise exception 'invalid team'; end if;
  update public.matches set match_date=p_date,match_time=p_time,home_team_id=hid,away_team_id=aid,venue=coalesce(p_venue,''),published=p_published,version=version+1,updated_by=auth.uid(),updated_at=now() where match_code=p_match_code and version=p_expected_version and not locked returning jsonb_build_object('match_code',match_code,'version',version) into out_row;
  if out_row is null then raise exception 'version conflict or match locked' using errcode='40001'; end if;
  insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'update_match',p_match_code,before_row,out_row); return out_row;
end $$;

create or replace function public.set_match_status(p_match_code text,p_expected_version integer,p_status text,p_published boolean,p_locked boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; out_row jsonb;
begin
  select public.current_app_role() into app_role; if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_status not in ('scheduled','postponed','cancelled','final') then raise exception 'invalid status'; end if;
  update public.matches set status=p_status,published=p_published,locked=p_locked,version=version+1,updated_by=auth.uid(),updated_at=now() where match_code=p_match_code and version=p_expected_version returning jsonb_build_object('match_code',match_code,'version',version,'status',status,'published',published,'locked',locked) into out_row;
  if out_row is null then raise exception 'version conflict' using errcode='40001'; end if;
  insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'set_match_status',p_match_code,out_row); return out_row;
end $$;

drop function if exists public.save_match_result(text,integer,integer,text);
create function public.save_match_result(p_match_code text,p_home_score integer,p_away_score integer,p_note text,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; mid uuid; before_row jsonb; out_row jsonb;
begin
  select public.current_app_role() into app_role; if app_role is null or app_role not in ('admin','scorer') then raise exception 'permission denied' using errcode='42501'; end if;
  if p_match_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' or char_length(coalesce(p_note,''))>500 or not ((p_home_score=3 and p_away_score=0) or (p_home_score=0 and p_away_score=3) or (p_home_score=2 and p_away_score=1) or (p_home_score=1 and p_away_score=2)) then raise exception 'invalid result input'; end if;
  select m.id into mid from public.matches m where m.match_code=p_match_code and not m.locked for update; if mid is null then raise exception 'unknown or locked match'; end if;
  select to_jsonb(r) into before_row from public.match_results r where r.match_id=mid;
  if before_row is null then
    if p_expected_version<>0 then raise exception 'version conflict' using errcode='40001'; end if;
    insert into public.match_results(match_id,home_score,away_score,note,published,updated_by) values(mid,p_home_score,p_away_score,coalesce(p_note,''),false,auth.uid()) returning jsonb_build_object('match_code',p_match_code,'version',version) into out_row;
  else
    update public.match_results set home_score=p_home_score,away_score=p_away_score,note=coalesce(p_note,''),version=version+1,updated_by=auth.uid(),updated_at=now() where match_id=mid and version=p_expected_version and (not locked or app_role='admin') returning jsonb_build_object('match_code',p_match_code,'version',version) into out_row;
    if out_row is null then raise exception 'version conflict or result locked' using errcode='40001'; end if;
  end if;
  update public.matches set status='final',version=version+1,updated_by=auth.uid(),updated_at=now() where id=mid;
  insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'save_result',p_match_code,before_row,out_row); return out_row;
end $$;

create or replace function public.lock_match_result(p_match_code text,p_expected_version integer,p_published boolean default true) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; out_row jsonb;
begin
  select public.current_app_role() into app_role; if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  update public.match_results r set locked=true,published=p_published,version=r.version+1,updated_by=auth.uid(),updated_at=now() from public.matches m where r.match_id=m.id and m.match_code=p_match_code and r.version=p_expected_version returning jsonb_build_object('match_code',p_match_code,'version',r.version,'locked',r.locked,'published',r.published) into out_row;
  if out_row is null then raise exception 'version conflict' using errcode='40001'; end if;
  insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'lock_result',p_match_code,out_row); return out_row;
end $$;

create or replace function public.set_profile_role(p_user_id uuid,p_role text,p_display_name text default '',p_active boolean default true) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; before_row jsonb;
begin
  select public.current_app_role() into app_role; if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_role is null or p_role not in ('admin','scorer') or char_length(coalesce(p_display_name,''))>100 then raise exception 'invalid profile input'; end if;
  select to_jsonb(p) into before_row from public.profiles p where p.id=p_user_id;
  insert into public.profiles(id,display_name,role,active) values(p_user_id,coalesce(p_display_name,''),p_role,p_active) on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,active=excluded.active;
  insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'set_profile_role',p_user_id::text,before_row,jsonb_build_object('id',p_user_id,'role',p_role,'active',p_active));
end $$;
-- Auth-user creation is intentionally outside SQL. A future authenticated Edge Function may call
-- the Auth Admin API with a server-side secret; no privileged key belongs in this repository or browser.

-- Keep import transactional (a PostgreSQL function call is one transaction), bounded, and admin-only.
create or replace function public.import_league_data(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare
  app_role text; season_code text; row jsonb; sid uuid; gid uuid; tid uuid; mid uuid; hid uuid; aid uuid; existing_sid uuid;
  team_count int; match_count int; result_count int; snapshot_count int;
begin
  select public.current_app_role() into app_role;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>2097152 then raise exception 'invalid payload'; end if;
  if jsonb_typeof(coalesce(p_payload->'teams','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'matches','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'results','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'snapshots','[]'::jsonb))<>'array' then raise exception 'payload collections must be arrays'; end if;
  team_count=jsonb_array_length(coalesce(p_payload->'teams','[]'::jsonb));
  match_count=jsonb_array_length(coalesce(p_payload->'matches','[]'::jsonb));
  result_count=jsonb_array_length(coalesce(p_payload->'results','[]'::jsonb));
  snapshot_count=jsonb_array_length(coalesce(p_payload->'snapshots','[]'::jsonb));
  if team_count>100 or match_count>500 or result_count>500 or snapshot_count>500 then raise exception 'batch limit exceeded'; end if;
  season_code=coalesce(p_payload->>'season_code','2026-autumn-second-half');
  if season_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then raise exception 'invalid season code'; end if;
  select s.id into sid from public.seasons s where s.code=season_code;
  if sid is null then raise exception 'season not initialized'; end if;

  for row in select value from jsonb_array_elements(coalesce(p_payload->'teams','[]'::jsonb)) loop
    if jsonb_typeof(row)<>'object' or coalesce(row->>'team_code','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'
       or row->>'group' not in ('A','B') or char_length(coalesce(row->>'name','')) not between 1 and 100
       or char_length(coalesce(row->>'short_name','')) not between 1 and 30 or char_length(coalesce(row->>'description',''))>1000
       or char_length(coalesce(row->>'logo_path',''))>300 or coalesce(row->>'name','')~'[[:cntrl:]]'
       or coalesce(row->>'short_name','')~'[[:cntrl:]]' then raise exception 'invalid team row'; end if;
    select g.id into gid from public.groups g where g.season_id=sid and g.code=row->>'group';
    if gid is null then raise exception 'unknown group'; end if;
    insert into public.teams(team_code,name,short_name,description,logo_path,active,updated_by)
    values(row->>'team_code',row->>'name',row->>'short_name',coalesce(row->>'description',''),coalesce(row->>'logo_path',''),coalesce((row->>'active')::boolean,true),auth.uid())
    on conflict(team_code) do update set name=excluded.name,short_name=excluded.short_name,description=excluded.description,logo_path=excluded.logo_path,active=excluded.active,version=public.teams.version+1,updated_by=auth.uid(),updated_at=now()
    returning id into tid;
    insert into public.season_teams(season_id,team_id,group_id,display_name,display_order,active)
    values(sid,tid,gid,coalesce(row->>'display_name',''),coalesce((row->>'display_order')::int,0),coalesce((row->>'active')::boolean,true))
    on conflict(season_id,team_id) do update set group_id=excluded.group_id,display_name=excluded.display_name,display_order=excluded.display_order,active=excluded.active;
  end loop;

  for row in select value from jsonb_array_elements(coalesce(p_payload->'matches','[]'::jsonb)) loop
    if jsonb_typeof(row)<>'object' or coalesce(row->>'match_code','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
       or row->>'group' not in ('A','B') or coalesce(row->>'home_team_code','')=coalesce(row->>'away_team_code','')
       or coalesce(row->>'status','scheduled') not in ('scheduled','postponed','cancelled','final')
       or char_length(coalesce(row->>'venue',''))>200 or coalesce(row->>'venue','')~'[[:cntrl:]]' then raise exception 'invalid match row'; end if;
    select g.id into gid from public.groups g where g.season_id=sid and g.code=row->>'group';
    select st.team_id into hid from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.group_id=gid and st.active and t.active and t.team_code=row->>'home_team_code';
    select st.team_id into aid from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.group_id=gid and st.active and t.active and t.team_code=row->>'away_team_code';
    if gid is null or hid is null or aid is null then raise exception 'invalid match reference'; end if;
    mid=null;
    existing_sid=null;
    select m.season_id into existing_sid from public.matches m where m.match_code=row->>'match_code';
    if existing_sid is not null and existing_sid<>sid then raise exception 'match code belongs to another season: %',row->>'match_code'; end if;
    insert into public.matches(season_id,group_id,match_code,match_date,match_time,home_team_id,away_team_id,venue,status,published,updated_by)
    values(sid,gid,row->>'match_code',(row->>'date')::date,(row->>'time')::time,hid,aid,coalesce(row->>'venue',''),coalesce(row->>'status','scheduled'),coalesce((row->>'published')::boolean,false),auth.uid())
    on conflict(match_code) do update set group_id=excluded.group_id,match_date=excluded.match_date,match_time=excluded.match_time,home_team_id=excluded.home_team_id,away_team_id=excluded.away_team_id,venue=excluded.venue,status=excluded.status,published=excluded.published,version=public.matches.version+1,updated_by=auth.uid(),updated_at=now()
    where public.matches.season_id=excluded.season_id and not public.matches.locked returning id into mid;
    if mid is null then
      select m.season_id into existing_sid from public.matches m where m.match_code=row->>'match_code';
      if existing_sid is distinct from sid then raise exception 'match code belongs to another season: %',row->>'match_code'; end if;
      raise exception 'match locked';
    end if;
  end loop;

  for row in select value from jsonb_array_elements(coalesce(p_payload->'results','[]'::jsonb)) loop
    if jsonb_typeof(row)<>'object' or coalesce(row->>'match_code','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
       or char_length(coalesce(row->>'note',''))>500 or coalesce(row->>'note','')~'[[:cntrl:]]'
       or not (((row->>'home_score')::int=3 and (row->>'away_score')::int=0) or ((row->>'home_score')::int=0 and (row->>'away_score')::int=3) or ((row->>'home_score')::int=2 and (row->>'away_score')::int=1) or ((row->>'home_score')::int=1 and (row->>'away_score')::int=2)) then raise exception 'invalid result row'; end if;
    select m.id into mid from public.matches m where m.season_id=sid and m.match_code=row->>'match_code' and not m.locked for update;
    if mid is null then raise exception 'unknown or locked match'; end if;
    tid=null;
    insert into public.match_results(match_id,home_score,away_score,note,published,updated_by)
    values(mid,(row->>'home_score')::int,(row->>'away_score')::int,coalesce(row->>'note',''),coalesce((row->>'published')::boolean,false),auth.uid())
    on conflict(match_id) do update set home_score=excluded.home_score,away_score=excluded.away_score,note=excluded.note,published=excluded.published,version=public.match_results.version+1,updated_by=auth.uid(),updated_at=now()
    where not public.match_results.locked returning match_id into tid;
    if tid is null then raise exception 'result locked'; end if;
    update public.matches set status='final',version=version+1,updated_by=auth.uid(),updated_at=now() where id=mid;
  end loop;

  for row in select value from jsonb_array_elements(coalesce(p_payload->'snapshots','[]'::jsonb)) loop
    if jsonb_typeof(row)<>'object' or coalesce(row->>'team_code','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'
       or row->>'group' not in ('A','B') or (row->>'points')::int not between 0 and 10000
       or (row->>'wins')::int not between 0 and 1000 or (row->>'losses')::int not between 0 and 1000
       or (row->>'rank')::int not between 1 and 100 or coalesce((row->>'rank_change')::int,0) not between -100 and 100 then raise exception 'invalid snapshot row'; end if;
    select g.id into gid from public.groups g where g.season_id=sid and g.code=row->>'group';
    select st.team_id into tid from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.group_id=gid and t.team_code=row->>'team_code';
    if gid is null or tid is null then raise exception 'invalid snapshot reference'; end if;
    insert into public.standings_snapshots(season_id,group_id,team_id,snapshot_date,points,wins,losses,rank,rank_change)
    values(sid,gid,tid,(row->>'snapshot_date')::date,(row->>'points')::int,(row->>'wins')::int,(row->>'losses')::int,(row->>'rank')::int,coalesce((row->>'rank_change')::int,0))
    on conflict(season_id,group_id,team_id,snapshot_date) do update set points=excluded.points,wins=excluded.wins,losses=excluded.losses,rank=excluded.rank,rank_change=excluded.rank_change;
  end loop;

  insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'import_league_data',format('%s teams, %s matches, %s results, %s snapshots',team_count,match_count,result_count,snapshot_count),jsonb_build_object('counts',jsonb_build_array(team_count,match_count,result_count,snapshot_count)));
  return public.get_admin_dataset(season_code);
end $$;

-- Revoke every write/admin RPC from PUBLIC and anon; authenticated callers still fail closed by profile role.
revoke all on function public.get_admin_dataset(text) from public,anon;
revoke all on function public.get_my_profile() from public,anon;
revoke all on function public.create_team(text,text,text,text,text,text,text,text,integer) from public,anon;
revoke all on function public.update_team(text,integer,text,text,text,text) from public,anon;
revoke all on function public.disable_team(text,integer) from public,anon;
revoke all on function public.create_match(text,text,text,date,time,text,text,text,boolean) from public,anon;
revoke all on function public.update_match(text,integer,date,time,text,text,text,boolean) from public,anon;
revoke all on function public.set_match_status(text,integer,text,boolean,boolean) from public,anon;
revoke all on function public.save_match_result(text,integer,integer,text,integer) from public,anon;
revoke all on function public.lock_match_result(text,integer,boolean) from public,anon;
revoke all on function public.set_profile_role(uuid,text,text,boolean) from public,anon;
revoke all on function public.import_league_data(jsonb) from public,anon;
grant execute on function public.get_admin_dataset(text) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.create_team(text,text,text,text,text,text,text,text,integer) to authenticated;
grant execute on function public.update_team(text,integer,text,text,text,text) to authenticated;
grant execute on function public.disable_team(text,integer) to authenticated;
grant execute on function public.create_match(text,text,text,date,time,text,text,text,boolean) to authenticated;
grant execute on function public.update_match(text,integer,date,time,text,text,text,boolean) to authenticated;
grant execute on function public.set_match_status(text,integer,text,boolean,boolean) to authenticated;
grant execute on function public.save_match_result(text,integer,integer,text,integer) to authenticated;
grant execute on function public.lock_match_result(text,integer,boolean) to authenticated;
grant execute on function public.set_profile_role(uuid,text,text,boolean) to authenticated;
grant execute on function public.import_league_data(jsonb) to authenticated;

-- Public logos: PNG/WebP only; administrators write. Pixel dimensions must be validated by
-- frontend plus the future server/Edge upload endpoint because Storage SQL metadata is insufficient.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('team-logos','team-logos',true,2097152,array['image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
do $$ begin drop policy if exists "team logos public read" on storage.objects; create policy "team logos public read" on storage.objects for select to anon,authenticated using(bucket_id='team-logos'); end $$;
do $$ begin drop policy if exists "team logos admin insert" on storage.objects; create policy "team logos admin insert" on storage.objects for insert to authenticated with check(bucket_id='team-logos' and public.current_app_role() is not null and public.current_app_role()='admin' and lower(storage.extension(name)) in ('png','webp')); end $$;
do $$ begin drop policy if exists "team logos admin update" on storage.objects; create policy "team logos admin update" on storage.objects for update to authenticated using(bucket_id='team-logos' and public.current_app_role() is not null and public.current_app_role()='admin') with check(bucket_id='team-logos' and public.current_app_role() is not null and public.current_app_role()='admin' and lower(storage.extension(name)) in ('png','webp')); end $$;
do $$ begin drop policy if exists "team logos admin delete" on storage.objects; create policy "team logos admin delete" on storage.objects for delete to authenticated using(bucket_id='team-logos' and public.current_app_role() is not null and public.current_app_role()='admin'); end $$;

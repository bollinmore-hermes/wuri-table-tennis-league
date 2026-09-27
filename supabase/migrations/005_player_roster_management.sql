-- Player roster management and admin dataset extension.
-- Apply only to an isolated Supabase Test project before promotion.

create table if not exists public.players(
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  name text not null,
  status text not null default 'active' check(status in ('active','inactive')),
  deleted_at timestamptz,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint players_name_length check(char_length(name) between 1 and 100)
);
create index if not exists players_team_active_idx on public.players(team_id,status) where deleted_at is null;
alter table public.players enable row level security;
revoke all on table public.players from public,anon,authenticated;

create or replace function public.save_player(
  p_player_id uuid,
  p_team_code text,
  p_name text,
  p_status text default 'active',
  p_expected_version integer default 0
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; tid uuid; before_row jsonb; after_row jsonb;
begin
  select public.current_app_role() into app_role;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_team_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$' or char_length(trim(coalesce(p_name,''))) not between 1 and 100 or p_status not in ('active','inactive') or p_expected_version<0 then raise exception 'invalid player input'; end if;
  select id into tid from public.teams where team_code=p_team_code and active;
  if tid is null then raise exception 'unknown active team'; end if;
  if p_player_id is null then
    if p_expected_version<>0 then raise exception 'version conflict' using errcode='40001'; end if;
    insert into public.players(team_id,name,status,updated_by) values(tid,trim(p_name),p_status,auth.uid())
      returning jsonb_build_object('id',id,'team_code',p_team_code,'name',name,'status',status,'version',version) into after_row;
    insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'create_player',after_row->>'id',after_row);
  else
    select jsonb_build_object('id',p.id,'name',p.name,'status',p.status,'version',p.version,'deleted_at',p.deleted_at) into before_row from public.players p where p.id=p_player_id;
    update public.players set team_id=tid,name=trim(p_name),status=p_status,deleted_at=null,version=version+1,updated_by=auth.uid(),updated_at=now()
      where id=p_player_id and version=p_expected_version
      returning jsonb_build_object('id',id,'team_code',p_team_code,'name',name,'status',status,'version',version) into after_row;
    if after_row is null then raise exception 'version conflict' using errcode='40001'; end if;
    insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'update_player',p_player_id::text,before_row,after_row);
  end if;
  return after_row;
end $$;

create or replace function public.disable_player(p_player_id uuid,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; before_row jsonb; after_row jsonb;
begin
  select public.current_app_role() into app_role;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_expected_version<1 then raise exception 'invalid player input'; end if;
  select jsonb_build_object('id',p.id,'name',p.name,'status',p.status,'version',p.version,'deleted_at',p.deleted_at) into before_row from public.players p where p.id=p_player_id;
  update public.players set status='inactive',deleted_at=now(),version=version+1,updated_by=auth.uid(),updated_at=now()
    where id=p_player_id and version=p_expected_version and deleted_at is null
    returning jsonb_build_object('id',id,'status',status,'deleted_at',deleted_at,'version',version) into after_row;
  if after_row is null then raise exception 'version conflict' using errcode='40001'; end if;
  insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'delete_player',p_player_id::text,before_row,after_row);
  return after_row;
end $$;

create or replace function public.save_team(
  p_season_code text,p_team_code text,p_name text,p_short_name text,p_group text,
  p_description text default '',p_display_order integer default 0,p_active boolean default true,p_expected_version integer default 0
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; sid uuid; gid uuid; tid uuid; before_row jsonb; after_row jsonb;
begin
  select public.current_app_role() into app_role;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_team_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$' or p_group not in ('A','B') or char_length(trim(coalesce(p_name,''))) not between 1 and 100 or char_length(trim(coalesce(p_short_name,''))) not between 1 and 30 or char_length(coalesce(p_description,''))>1000 or p_display_order not between 0 and 100 or p_expected_version<0 then raise exception 'invalid team input'; end if;
  select s.id into sid from public.seasons s where s.code=p_season_code;
  select g.id into gid from public.groups g where g.season_id=sid and g.code=p_group;
  if sid is null or gid is null then raise exception 'unknown season or group'; end if;
  if p_expected_version=0 then
    insert into public.teams(team_code,name,short_name,description,active,updated_by) values(p_team_code,trim(p_name),trim(p_short_name),coalesce(p_description,''),p_active,auth.uid()) returning id into tid;
    insert into public.season_teams(season_id,team_id,group_id,display_name,display_order,active) values(sid,tid,gid,trim(p_name),p_display_order,p_active);
    after_row=jsonb_build_object('team_code',p_team_code,'version',1,'group',p_group,'display_order',p_display_order,'active',p_active);
    insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'create_team',p_team_code,after_row);
  else
    select jsonb_build_object('team_code',t.team_code,'name',t.name,'short_name',t.short_name,'description',t.description,'active',t.active,'version',t.version,'group',g.code,'display_order',st.display_order) into before_row from public.teams t join public.season_teams st on st.team_id=t.id and st.season_id=sid join public.groups g on g.id=st.group_id where t.team_code=p_team_code;
    update public.teams set name=trim(p_name),short_name=trim(p_short_name),description=coalesce(p_description,''),active=p_active,version=version+1,updated_by=auth.uid(),updated_at=now() where team_code=p_team_code and version=p_expected_version returning id into tid;
    if tid is null then raise exception 'version conflict' using errcode='40001'; end if;
    update public.season_teams set group_id=gid,display_name=trim(p_name),display_order=p_display_order,active=p_active where season_id=sid and team_id=tid;
    after_row=jsonb_build_object('team_code',p_team_code,'version',p_expected_version+1,'group',p_group,'display_order',p_display_order,'active',p_active);
    insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'update_team',p_team_code,before_row,after_row);
  end if;
  return after_row;
end $$;

create or replace function public.save_match(
  p_season_code text,p_match_code text,p_group text,p_date date,p_time time,p_home_team_code text,p_away_team_code text,
  p_venue text default '',p_status text default 'scheduled',p_published boolean default false,p_expected_version integer default 0
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; sid uuid; gid uuid; hid uuid; aid uuid; mid uuid; before_row jsonb; after_row jsonb;
begin
  select public.current_app_role() into app_role;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_match_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' or p_group not in ('A','B') or p_home_team_code=p_away_team_code or p_status not in ('scheduled','postponed','cancelled','final') or char_length(coalesce(p_venue,''))>200 or p_expected_version<0 then raise exception 'invalid match input'; end if;
  select s.id into sid from public.seasons s where s.code=p_season_code;
  select g.id into gid from public.groups g where g.season_id=sid and g.code=p_group;
  select st.team_id into hid from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.group_id=gid and st.active and t.active and t.team_code=p_home_team_code;
  select st.team_id into aid from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.group_id=gid and st.active and t.active and t.team_code=p_away_team_code;
  if sid is null or gid is null or hid is null or aid is null then raise exception 'invalid match reference'; end if;
  if p_expected_version=0 then
    insert into public.matches(season_id,group_id,match_code,match_date,match_time,home_team_id,away_team_id,venue,status,published,updated_by) values(sid,gid,p_match_code,p_date,p_time,hid,aid,coalesce(p_venue,''),p_status,p_published,auth.uid()) returning id into mid;
    after_row=jsonb_build_object('match_code',p_match_code,'version',1,'status',p_status);
    insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'create_match',p_match_code,after_row);
  else
    select to_jsonb(m) into before_row from public.matches m where m.match_code=p_match_code and m.season_id=sid;
    update public.matches set group_id=gid,match_date=p_date,match_time=p_time,home_team_id=hid,away_team_id=aid,venue=coalesce(p_venue,''),status=p_status,published=p_published,version=version+1,updated_by=auth.uid(),updated_at=now() where match_code=p_match_code and season_id=sid and version=p_expected_version and not locked returning id into mid;
    if mid is null then raise exception 'version conflict or match locked' using errcode='40001'; end if;
    after_row=jsonb_build_object('match_code',p_match_code,'version',p_expected_version+1,'status',p_status);
    insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'update_match',p_match_code,before_row,after_row);
  end if;
  return after_row;
end $$;

create or replace function public.get_admin_dataset(p_season_code text default '2026-autumn-second-half') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; sid uuid; result jsonb;
begin
  select public.current_app_role() into app_role;
  if app_role is null or app_role not in ('admin','scorer') then raise exception 'permission denied' using errcode='42501'; end if;
  select s.id into sid from public.seasons s where s.code=p_season_code;
  if sid is null then raise exception 'season not initialized'; end if;
  select jsonb_build_object(
    'season',(select jsonb_build_object('code',s.code,'name',s.name,'status',s.status) from public.seasons s where s.id=sid),
    'teams',coalesce((select jsonb_agg(jsonb_build_object('team_code',t.team_code,'name',t.name,'short_name',t.short_name,'description',t.description,'logo_path',t.logo_path,'group',g.code,'display_name',st.display_name,'display_order',st.display_order,'active',t.active and st.active,'version',t.version) order by g.code,st.display_order,t.team_code) from public.teams t join public.season_teams st on st.team_id=t.id join public.groups g on g.id=st.group_id where st.season_id=sid),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'group',g.code,'date',m.match_date,'time',to_char(m.match_time,'HH24:MI'),'home_team_code',ht.team_code,'away_team_code',at.team_code,'venue',m.venue,'status',m.status,'published',m.published,'locked',m.locked,'version',m.version) order by m.match_date,m.match_time,m.match_code) from public.matches m join public.groups g on g.id=m.group_id join public.teams ht on ht.id=m.home_team_id join public.teams at on at.id=m.away_team_id where m.season_id=sid),'[]'::jsonb),
    'results',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'home_score',r.home_score,'away_score',r.away_score,'note',r.note,'published',r.published,'locked',r.locked,'version',r.version) order by m.match_code) from public.match_results r join public.matches m on m.id=r.match_id where m.season_id=sid),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(jsonb_build_object('group',g.code,'snapshot_date',ss.snapshot_date,'team_code',t.team_code,'points',ss.points,'wins',ss.wins,'losses',ss.losses,'rank',ss.rank,'rank_change',ss.rank_change)) from public.standings_snapshots ss join public.groups g on g.id=ss.group_id join public.teams t on t.id=ss.team_id where ss.season_id=sid),'[]'::jsonb),
    'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'team_code',t.team_code,'name',p.name,'status',p.status,'deleted_at',p.deleted_at,'version',p.version,'created_at',p.created_at,'updated_at',p.updated_at) order by t.team_code,p.name,p.id) from public.players p join public.teams t on t.id=p.team_id join public.season_teams st on st.team_id=t.id where st.season_id=sid and p.deleted_at is null),'[]'::jsonb),
    'users',case when app_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'role',p.role,'active',p.active) order by p.role,p.display_name,p.id) from public.profiles p),'[]'::jsonb) else '[]'::jsonb end,
    'audits',case when app_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'detail',a.detail,'before_data',a.before_data,'after_data',a.after_data,'created_at',a.created_at,'user_id',a.user_id) order by a.created_at desc) from (select * from public.audit_logs order by created_at desc limit 100) a),'[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end $$;

revoke all on function public.save_player(uuid,text,text,text,integer) from public,anon;
revoke all on function public.disable_player(uuid,integer) from public,anon;
revoke all on function public.save_team(text,text,text,text,text,text,integer,boolean,integer) from public,anon;
revoke all on function public.save_match(text,text,text,date,time,text,text,text,text,boolean,integer) from public,anon;
revoke all on function public.get_admin_dataset(text) from public,anon;
grant execute on function public.save_player(uuid,text,text,text,integer) to authenticated;
grant execute on function public.disable_player(uuid,integer) to authenticated;
grant execute on function public.save_team(text,text,text,text,text,text,integer,boolean,integer) to authenticated;
grant execute on function public.save_match(text,text,text,date,time,text,text,text,text,boolean,integer) to authenticated;
grant execute on function public.get_admin_dataset(text) to authenticated;

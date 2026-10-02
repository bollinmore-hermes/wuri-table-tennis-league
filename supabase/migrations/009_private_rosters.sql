-- #29: full names are admin-only; public projection masks at the server.
-- Private roster payloads are supplied outside source control. Never seed names here.
begin;
alter table public.players add column roster_role text not null default 'player' check(roster_role in ('leader','player'));
alter table public.players add column display_order integer not null default 0 check(display_order between 0 and 100);
alter table public.players add column public_visible boolean not null default false;
alter table public.players add column season_code text references public.seasons(code);
alter table public.players add constraint public_roster_name_privacy check(not public_visible or char_length(trim(name))>=3);
create unique index players_roster_slot on public.players(team_id,season_code,roster_role,display_order) where season_code is not null and deleted_at is null;
create unique index players_one_active_leader on public.players(team_id,season_code) where roster_role='leader' and status='active' and deleted_at is null;

create function public.mask_roster_name(p_name text) returns text
language sql immutable set search_path=pg_catalog,public,pg_temp as $$
  select case when char_length(trim(coalesce(p_name,'')))<3 then '＊'
    else left(trim(p_name),1)||repeat('＊',char_length(trim(p_name))-2)||right(trim(p_name),1) end
$$;
revoke all on function public.mask_roster_name(text) from public,anon,authenticated;

-- Remove the legacy overload: PostgREST must resolve the new defaulted signature.
drop function public.save_player(uuid,text,text,text,integer);
create or replace function public.save_player(
  p_player_id uuid,
  p_team_code text,
  p_name text,
  p_status text default 'active',
  p_expected_version integer default 0,
  p_roster_role text default 'player',
  p_display_order integer default 0,
  p_public_visible boolean default false,
  p_season_code text default '2026-autumn-second-half'
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; tid uuid; before_row jsonb; after_row jsonb;
begin
  select public.current_app_role() into app_role;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_team_code is null or p_name is null or p_status is null or p_expected_version is null or p_roster_role is null or p_roster_role not in ('leader','player') or p_display_order is null or p_display_order not between 0 and 100 or p_public_visible is null or p_season_code is null then raise exception 'invalid roster input'; end if;
  if p_team_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$' or char_length(trim(coalesce(p_name,''))) not between 1 and 100 or p_status not in ('active','inactive') or p_expected_version<0 then raise exception 'invalid player input'; end if;
  select id into tid from public.teams where team_code=p_team_code and active;
  if not exists(select 1 from public.season_teams st join public.seasons s on s.id=st.season_id where st.team_id=tid and s.code=p_season_code and st.active) then raise exception 'unknown season team'; end if;
  if p_public_visible and char_length(trim(p_name))<3 then raise exception 'short names require explicit privacy policy'; end if;
  if tid is null then raise exception 'unknown active team'; end if;
  if p_player_id is null then
    if p_expected_version<>0 then raise exception 'version conflict' using errcode='40001'; end if;
    insert into public.players(team_id,name,status,updated_by,roster_role,display_order,public_visible,season_code) values(tid,trim(p_name),p_status,auth.uid(),p_roster_role,p_display_order,p_public_visible,p_season_code)
      returning jsonb_build_object('id',id,'team_code',p_team_code,'name',name,'roster_role',roster_role,'display_order',display_order,'public_visible',public_visible,'season_code',season_code,'status',status,'version',version) into after_row;
    insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'create_player',after_row->>'id',after_row);
  else
    select jsonb_build_object('id',p.id,'name',p.name,'roster_role',p.roster_role,'display_order',p.display_order,'public_visible',p.public_visible,'season_code',p.season_code,'status',p.status,'version',p.version,'deleted_at',p.deleted_at) into before_row from public.players p where p.id=p_player_id;
    update public.players set team_id=tid,name=trim(p_name),status=p_status,roster_role=p_roster_role,display_order=p_display_order,public_visible=p_public_visible,season_code=p_season_code,deleted_at=null,version=version+1,updated_by=auth.uid(),updated_at=now()
      where id=p_player_id and version=p_expected_version
      returning jsonb_build_object('id',id,'team_code',p_team_code,'name',name,'roster_role',roster_role,'display_order',display_order,'public_visible',public_visible,'season_code',season_code,'status',status,'version',version) into after_row;
    if after_row is null then raise exception 'version conflict' using errcode='40001'; end if;
    insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'update_player',p_player_id::text,before_row,after_row);
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
    'players',case when app_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'team_code',t.team_code,'name',p.name,'roster_role',p.roster_role,'display_order',p.display_order,'public_visible',p.public_visible,'season_code',p.season_code,'status',p.status,'deleted_at',p.deleted_at,'version',p.version,'created_at',p.created_at,'updated_at',p.updated_at) order by t.team_code,case when p.roster_role='leader' then 0 else 1 end,p.display_order,p.id) from public.players p join public.teams t on t.id=p.team_id join public.season_teams st on st.team_id=t.id where st.season_id=sid and (p.season_code is null or p.season_code=p_season_code) and p.deleted_at is null),'[]'::jsonb) else '[]'::jsonb end,
    'users',case when app_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'role',p.role,'active',p.active) order by p.role,p.display_name,p.id) from public.profiles p),'[]'::jsonb) else '[]'::jsonb end,
    'audits',case when app_role='admin' then coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'detail',a.detail,'before_data',a.before_data,'after_data',a.after_data,'created_at',a.created_at,'user_id',a.user_id) order by a.created_at desc) from (select * from public.audit_logs order by created_at desc limit 100) a),'[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end $$;

create or replace function public.get_public_league(p_season_code text) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare sid uuid; result jsonb;
begin
  if p_season_code is null or p_season_code !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then raise exception 'invalid season code'; end if;
  select s.id into sid from public.seasons s where s.code=p_season_code and s.status='active';
  if sid is null then return jsonb_build_object('season',null,'teams','[]'::jsonb,'matches','[]'::jsonb,'results','[]'::jsonb,'snapshots','[]'::jsonb,'roster','[]'::jsonb); end if;
  select jsonb_build_object(
    'season',jsonb_build_object('code',s.code,'name',s.name,'start_date',s.start_date,'end_date',s.end_date),
    'teams',coalesce((select jsonb_agg(jsonb_build_object('team_code',t.team_code,'name',coalesce(nullif(st.display_name,''),t.name),'short_name',t.short_name,'group',g.code,'display_order',st.display_order,'description',t.description,'logo_path',t.logo_path,'active',true) order by g.display_order,st.display_order,t.team_code) from public.season_teams st join public.teams t on t.id=st.team_id join public.groups g on g.id=st.group_id where st.season_id=sid and st.active and t.active),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'group',g.code,'date',m.match_date,'time',to_char(m.match_time,'HH24:MI'),'home_team_code',ht.team_code,'away_team_code',at.team_code,'venue',m.venue,'status',case when exists(select 1 from public.match_results pr where pr.match_id=m.id and pr.published) then 'final' when m.status='final' then 'scheduled' else m.status end) order by m.match_date,m.match_time,m.match_code) from public.matches m join public.groups g on g.id=m.group_id join public.teams ht on ht.id=m.home_team_id join public.teams at on at.id=m.away_team_id where m.season_id=sid and m.published),'[]'::jsonb),
    'results',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'home_score',r.home_score,'away_score',r.away_score,'status','final') order by m.match_code) from public.match_results r join public.matches m on m.id=r.match_id where m.season_id=sid and m.published and r.published),'[]'::jsonb),
    'roster',coalesce((select jsonb_agg(jsonb_build_object('team_code',t.team_code,'display_name',public.mask_roster_name(p.name),'roster_role',p.roster_role,'display_order',p.display_order) order by t.team_code,case when p.roster_role='leader' then 0 else 1 end,p.display_order,p.id) from public.players p join public.teams t on t.id=p.team_id join public.season_teams st on st.team_id=t.id where st.season_id=sid and st.active and t.active and p.season_code=p_season_code and p.status='active' and p.deleted_at is null and p.public_visible),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(jsonb_build_object('group',g.code,'snapshot_date',ss.snapshot_date,'team_code',t.team_code,'points',ss.points,'wins',ss.wins,'losses',ss.losses,'rank',ss.rank,'rank_change',ss.rank_change) order by ss.snapshot_date,g.code,ss.rank) from public.standings_snapshots ss join public.groups g on g.id=ss.group_id join public.teams t on t.id=ss.team_id where ss.season_id=sid),'[]'::jsonb)
  ) into result from public.seasons s where s.id=sid;
  return result;
end $$;

create function public.import_team_rosters(p_season_code text,p_rosters jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; entry jsonb; member jsonb; tid uuid; pid uuid; current_version integer; n integer:=0; seen text[]:='{}'; seen_members text[]; slot text;
begin
  select public.current_app_role() into app_role;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_rosters is null or jsonb_typeof(p_rosters) is distinct from 'array' then raise exception 'invalid rosters'; end if;
  if jsonb_array_length(p_rosters) not between 1 and 100 then raise exception 'invalid roster count'; end if;
  for entry in select value from jsonb_array_elements(p_rosters) loop
    if entry->>'team_code' is null or entry->>'team_code'=any(seen) then raise exception 'duplicate or missing team'; end if;
    seen=array_append(seen,entry->>'team_code'); seen_members='{}';
    select t.id into tid from public.teams t where t.team_code=entry->>'team_code' and t.active;
    if tid is null or jsonb_typeof(entry->'members') is distinct from 'array' then raise exception 'invalid team roster'; end if;
    if jsonb_array_length(entry->'members') not between 1 and 101 then raise exception 'invalid member count'; end if;
    for member in select value from jsonb_array_elements(entry->'members') loop
      if jsonb_typeof(member->'name') is distinct from 'string' or jsonb_typeof(member->'display_order') is distinct from 'number' or member->>'roster_role' is null or member->>'roster_role' not in ('leader','player') then raise exception 'invalid member'; end if;
      slot=(member->>'roster_role')||':'||(member->>'display_order');
      if slot=any(seen_members) then raise exception 'duplicate roster slot'; end if;
      seen_members=array_append(seen_members,slot);
      select p.id,p.version into pid,current_version from public.players p where p.team_id=tid and p.season_code=p_season_code and p.roster_role=member->>'roster_role' and p.display_order=(member->>'display_order')::integer and p.deleted_at is null;
      if exists(select 1 from public.players p where p.id=pid and p.name=trim(member->>'name') and p.status='active' and p.public_visible) then continue; end if;
      perform public.save_player(pid,entry->>'team_code',member->>'name','active',coalesce(current_version,0),member->>'roster_role',(member->>'display_order')::integer,true,p_season_code);
      n=n+1;
    end loop;
  end loop;
  return jsonb_build_object('changed',n,'teams',cardinality(seen));
end $$;
revoke all on function public.save_player(uuid,text,text,text,integer,text,integer,boolean,text) from public,anon;
grant execute on function public.save_player(uuid,text,text,text,integer,text,integer,boolean,text) to authenticated;
revoke all on function public.import_team_rosters(text,jsonb) from public,anon;
grant execute on function public.import_team_rosters(text,jsonb) to authenticated;
revoke all on table public.players from public,anon,authenticated;
commit;

-- P0 RPC hardening. Safe to reapply after the v0.3 schema migrations.

create or replace function public.current_app_role() returns text
language sql stable security definer
set search_path=public,pg_temp
as $$
  select role from public.profiles where id=auth.uid() and active=true
$$;

create or replace function public.get_admin_dataset() returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare sid uuid; result jsonb;
begin
  if public.current_app_role() not in ('admin','scorer') then raise exception 'permission denied' using errcode='42501'; end if;
  select id into sid from public.seasons where code='2026-autumn-second-half';
  if sid is null then raise exception 'season not initialized'; end if;
  select jsonb_build_object(
    'teams',coalesce((select jsonb_agg(jsonb_build_object('team_code',t.team_code,'name',t.name,'short_name',t.short_name,'group',g.code,'active',t.active) order by t.team_code) from teams t join season_teams st on st.team_id=t.id join groups g on g.id=st.group_id where st.season_id=sid),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'group',g.code,'date',m.match_date,'time',to_char(m.match_time,'HH24:MI'),'home_team_code',ht.team_code,'away_team_code',at.team_code,'venue',m.venue,'status',m.status) order by m.match_date,m.match_time,m.match_code) from matches m join groups g on g.id=m.group_id join teams ht on ht.id=m.home_team_id join teams at on at.id=m.away_team_id where m.season_id=sid),'[]'::jsonb),
    'results',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'home_score',r.home_score,'away_score',r.away_score,'status','final','note',r.note)) from match_results r join matches m on m.id=r.match_id where m.season_id=sid),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(jsonb_build_object('group',g.code,'snapshot_date',s.snapshot_date,'team_code',t.team_code,'points',s.points,'wins',s.wins,'losses',s.losses,'rank',s.rank,'rank_change',s.rank_change)) from standings_snapshots s join groups g on g.id=s.group_id join teams t on t.id=s.team_id where s.season_id=sid),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.import_league_data(p_payload jsonb) returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  sid uuid; row jsonb; tid uuid; gid uuid; mid uuid; htid uuid; atid uuid;
  team_count int; match_count int; result_count int; snapshot_count int;
begin
  if public.current_app_role()<>'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>2097152 then raise exception 'invalid payload'; end if;
  if jsonb_typeof(coalesce(p_payload->'teams','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'matches','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'results','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'snapshots','[]'::jsonb))<>'array' then raise exception 'payload collections must be arrays'; end if;
  team_count:=jsonb_array_length(coalesce(p_payload->'teams','[]'::jsonb));
  match_count:=jsonb_array_length(coalesce(p_payload->'matches','[]'::jsonb));
  result_count:=jsonb_array_length(coalesce(p_payload->'results','[]'::jsonb));
  snapshot_count:=jsonb_array_length(coalesce(p_payload->'snapshots','[]'::jsonb));
  if team_count>100 or match_count>500 or result_count>500 or snapshot_count>500 then raise exception 'batch limit exceeded'; end if;

  select id into sid from seasons where code='2026-autumn-second-half';
  if sid is null then raise exception 'season not initialized'; end if;

  for row in select value from jsonb_array_elements(coalesce(p_payload->'teams','[]'::jsonb)) loop
    if jsonb_typeof(row)<>'object'
       or coalesce(row->>'team_code','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'
       or row->>'group' not in ('A','B')
       or char_length(coalesce(row->>'name','')) not between 1 and 100
       or char_length(coalesce(row->>'short_name','')) not between 1 and 30
       or coalesce(row->>'name','')~'[[:cntrl:]]'
       or coalesce(row->>'short_name','')~'[[:cntrl:]]' then raise exception 'invalid team row'; end if;
    insert into teams(team_code,name,short_name,active)
    values(row->>'team_code',row->>'name',row->>'short_name',coalesce((row->>'active')::boolean,true))
    on conflict(team_code) do update set name=excluded.name,short_name=excluded.short_name,active=excluded.active returning id into tid;
    select id into gid from groups where season_id=sid and code=row->>'group';
    if gid is null then raise exception 'unknown group'; end if;
    insert into season_teams(season_id,team_id,group_id) values(sid,tid,gid)
    on conflict(season_id,team_id) do update set group_id=excluded.group_id;
  end loop;

  for row in select value from jsonb_array_elements(coalesce(p_payload->'matches','[]'::jsonb)) loop
    if jsonb_typeof(row)<>'object'
       or coalesce(row->>'match_code','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
       or coalesce(row->>'home_team_code','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'
       or coalesce(row->>'away_team_code','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'
       or row->>'group' not in ('A','B')
       or coalesce(row->>'status','scheduled') not in ('scheduled','postponed','cancelled','final')
       or char_length(coalesce(row->>'venue',''))>200
       or coalesce(row->>'venue','')~'[[:cntrl:]]' then raise exception 'invalid match row'; end if;
    select id into gid from groups where season_id=sid and code=row->>'group';
    select id into htid from teams where team_code=row->>'home_team_code';
    select id into atid from teams where team_code=row->>'away_team_code';
    if gid is null or htid is null or atid is null or htid=atid then raise exception 'invalid match %',row->>'match_code'; end if;
    insert into matches(season_id,group_id,match_code,match_date,match_time,home_team_id,away_team_id,venue,status)
    values(sid,gid,row->>'match_code',(row->>'date')::date,(row->>'time')::time,htid,atid,coalesce(row->>'venue',''),coalesce(row->>'status','scheduled'))
    on conflict(match_code) do update set group_id=excluded.group_id,match_date=excluded.match_date,match_time=excluded.match_time,home_team_id=excluded.home_team_id,away_team_id=excluded.away_team_id,venue=excluded.venue,status=excluded.status,updated_at=now();
  end loop;

  for row in select value from jsonb_array_elements(coalesce(p_payload->'results','[]'::jsonb)) loop
    if jsonb_typeof(row)<>'object'
       or coalesce(row->>'match_code','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
       or char_length(coalesce(row->>'note',''))>500
       or coalesce(row->>'note','')~'[[:cntrl:]]' then raise exception 'invalid result row'; end if;
    select id into mid from matches where match_code=row->>'match_code';
    if mid is null then raise exception 'unknown match %',row->>'match_code'; end if;
    if not ((((row->>'home_score')::int)=3 and (row->>'away_score')::int=0) or (((row->>'home_score')::int)=0 and (row->>'away_score')::int=3) or (((row->>'home_score')::int)=2 and (row->>'away_score')::int=1) or (((row->>'home_score')::int)=1 and (row->>'away_score')::int=2)) then raise exception 'invalid score'; end if;
    insert into match_results(match_id,home_score,away_score,note,updated_by)
    values(mid,(row->>'home_score')::int,(row->>'away_score')::int,coalesce(row->>'note',''),auth.uid())
    on conflict(match_id) do update set home_score=excluded.home_score,away_score=excluded.away_score,note=excluded.note,updated_by=auth.uid(),updated_at=now();
  end loop;

  for row in select value from jsonb_array_elements(coalesce(p_payload->'snapshots','[]'::jsonb)) loop
    if jsonb_typeof(row)<>'object'
       or coalesce(row->>'team_code','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'
       or row->>'group' not in ('A','B')
       or (row->>'points')::int not between 0 and 10000
       or (row->>'wins')::int not between 0 and 1000
       or (row->>'losses')::int not between 0 and 1000
       or (row->>'rank')::int not between 1 and 100
       or coalesce((row->>'rank_change')::int,0) not between -100 and 100 then raise exception 'invalid snapshot row'; end if;
    select id into gid from groups where season_id=sid and code=row->>'group';
    select id into tid from teams where team_code=row->>'team_code';
    if gid is null or tid is null then raise exception 'invalid snapshot reference'; end if;
    insert into standings_snapshots(season_id,group_id,team_id,snapshot_date,points,wins,losses,rank,rank_change)
    values(sid,gid,tid,(row->>'snapshot_date')::date,(row->>'points')::int,(row->>'wins')::int,(row->>'losses')::int,(row->>'rank')::int,coalesce((row->>'rank_change')::int,0))
    on conflict(season_id,group_id,team_id,snapshot_date) do update set points=excluded.points,wins=excluded.wins,losses=excluded.losses,rank=excluded.rank,rank_change=excluded.rank_change;
  end loop;
  insert into audit_logs(user_id,action,detail,after_data) values(auth.uid(),'excel_import','Excel transaction import',p_payload);
  return public.get_admin_dataset();
end $$;

create or replace function public.save_match_result(p_match_code text,p_home_score int,p_away_score int,p_note text default '') returns void
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare mid uuid; old jsonb;
begin
  if public.current_app_role() not in ('admin','scorer') then raise exception 'permission denied' using errcode='42501'; end if;
  if p_match_code is null or p_match_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then raise exception 'invalid match code'; end if;
  if char_length(coalesce(p_note,''))>500 or coalesce(p_note,'')~'[[:cntrl:]]' then raise exception 'invalid note'; end if;
  if not ((p_home_score=3 and p_away_score=0) or (p_home_score=0 and p_away_score=3) or (p_home_score=2 and p_away_score=1) or (p_home_score=1 and p_away_score=2)) then raise exception 'invalid score'; end if;
  select m.id,to_jsonb(r) into mid,old from matches m left join match_results r on r.match_id=m.id where m.match_code=p_match_code;
  if mid is null then raise exception 'unknown match'; end if;
  if exists(select 1 from match_results where match_id=mid and locked=true) and public.current_app_role()<>'admin' then raise exception 'result locked' using errcode='42501'; end if;
  insert into match_results(match_id,home_score,away_score,note,updated_by) values(mid,p_home_score,p_away_score,coalesce(p_note,''),auth.uid())
  on conflict(match_id) do update set home_score=excluded.home_score,away_score=excluded.away_score,note=excluded.note,updated_by=auth.uid(),updated_at=now();
  update matches set status='final',updated_at=now() where id=mid;
  insert into audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'save_result',p_match_code,old,jsonb_build_object('home_score',p_home_score,'away_score',p_away_score,'note',coalesce(p_note,'')));
end $$;

revoke all on function public.current_app_role() from public,anon;
revoke all on function public.get_admin_dataset() from public,anon;
revoke all on function public.import_league_data(jsonb) from public,anon;
revoke all on function public.save_match_result(text,int,int,text) from public,anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.get_admin_dataset() to authenticated;
grant execute on function public.import_league_data(jsonb) to authenticated;
grant execute on function public.save_match_result(text,int,int,text) to authenticated;

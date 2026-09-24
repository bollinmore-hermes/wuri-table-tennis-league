-- Replace the legacy 3-x score rule with the official team-match rule.
alter table public.match_results drop constraint if exists match_results_check;
alter table public.match_results add constraint match_results_official_score_check check (
  (home_score=3 and away_score=0) or (home_score=0 and away_score=3) or
  (home_score=2 and away_score=1) or (home_score=1 and away_score=2)
);

create or replace function public.import_league_data(p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare sid uuid; row jsonb; tid uuid; gid uuid; mid uuid; htid uuid; atid uuid;
begin
  if public.current_app_role()<>'admin' then raise exception 'admin role required'; end if;
  select id into sid from seasons where code='2026-autumn-second-half';
  if sid is null then raise exception 'season not initialized'; end if;
  for row in select * from jsonb_array_elements(coalesce(p_payload->'teams','[]'::jsonb)) loop
    if row->>'group' not in ('A','B') then raise exception 'invalid group'; end if;
    insert into teams(team_code,name,short_name,active) values(row->>'team_code',row->>'name',row->>'short_name',coalesce((row->>'active')::boolean,true))
    on conflict(team_code) do update set name=excluded.name,short_name=excluded.short_name,active=excluded.active returning id into tid;
    select id into gid from groups where season_id=sid and code=row->>'group';
    insert into season_teams(season_id,team_id,group_id) values(sid,tid,gid) on conflict(season_id,team_id) do update set group_id=excluded.group_id;
  end loop;
  for row in select * from jsonb_array_elements(coalesce(p_payload->'matches','[]'::jsonb)) loop
    select id into gid from groups where season_id=sid and code=row->>'group'; select id into htid from teams where team_code=row->>'home_team_code'; select id into atid from teams where team_code=row->>'away_team_code';
    if gid is null or htid is null or atid is null or htid=atid then raise exception 'invalid match %',row->>'match_code'; end if;
    insert into matches(season_id,group_id,match_code,match_date,match_time,home_team_id,away_team_id,venue,status)
    values(sid,gid,row->>'match_code',(row->>'date')::date,(row->>'time')::time,htid,atid,coalesce(row->>'venue',''),coalesce(row->>'status','scheduled'))
    on conflict(match_code) do update set group_id=excluded.group_id,match_date=excluded.match_date,match_time=excluded.match_time,home_team_id=excluded.home_team_id,away_team_id=excluded.away_team_id,venue=excluded.venue,status=excluded.status,updated_at=now();
  end loop;
  for row in select * from jsonb_array_elements(coalesce(p_payload->'results','[]'::jsonb)) loop
    select id into mid from matches where match_code=row->>'match_code'; if mid is null then raise exception 'unknown match %',row->>'match_code'; end if;
    if not ((((row->>'home_score')::int)=3 and (row->>'away_score')::int=0) or (((row->>'home_score')::int)=0 and (row->>'away_score')::int=3) or (((row->>'home_score')::int)=2 and (row->>'away_score')::int=1) or (((row->>'home_score')::int)=1 and (row->>'away_score')::int=2)) then raise exception 'invalid score'; end if;
    insert into match_results(match_id,home_score,away_score,note,updated_by) values(mid,(row->>'home_score')::int,(row->>'away_score')::int,coalesce(row->>'note',''),auth.uid())
    on conflict(match_id) do update set home_score=excluded.home_score,away_score=excluded.away_score,note=excluded.note,updated_by=auth.uid(),updated_at=now();
  end loop;
  for row in select * from jsonb_array_elements(coalesce(p_payload->'snapshots','[]'::jsonb)) loop
    select id into gid from groups where season_id=sid and code=row->>'group'; select id into tid from teams where team_code=row->>'team_code';
    insert into standings_snapshots(season_id,group_id,team_id,snapshot_date,points,wins,losses,rank,rank_change)
    values(sid,gid,tid,(row->>'snapshot_date')::date,(row->>'points')::int,(row->>'wins')::int,(row->>'losses')::int,(row->>'rank')::int,coalesce((row->>'rank_change')::int,0))
    on conflict(season_id,group_id,team_id,snapshot_date) do update set points=excluded.points,wins=excluded.wins,losses=excluded.losses,rank=excluded.rank,rank_change=excluded.rank_change;
  end loop;
  insert into audit_logs(user_id,action,detail,after_data) values(auth.uid(),'excel_import','Excel transaction import',p_payload);
  return public.get_admin_dataset();
end $$;

create or replace function public.save_match_result(p_match_code text,p_home_score int,p_away_score int,p_note text default '') returns void language plpgsql security definer set search_path=public as $$
declare mid uuid; old jsonb;
begin
  if public.current_app_role() not in ('admin','scorer') then raise exception 'permission denied'; end if;
  if not ((p_home_score=3 and p_away_score=0) or (p_home_score=0 and p_away_score=3) or (p_home_score=2 and p_away_score=1) or (p_home_score=1 and p_away_score=2)) then raise exception 'invalid score'; end if;
  select m.id,to_jsonb(r) into mid,old from matches m left join match_results r on r.match_id=m.id where m.match_code=p_match_code;
  if mid is null then raise exception 'unknown match'; end if;
  if exists(select 1 from match_results where match_id=mid and locked=true) and public.current_app_role()<>'admin' then raise exception 'result locked'; end if;
  insert into match_results(match_id,home_score,away_score,note,updated_by) values(mid,p_home_score,p_away_score,coalesce(p_note,''),auth.uid())
  on conflict(match_id) do update set home_score=excluded.home_score,away_score=excluded.away_score,note=excluded.note,updated_by=auth.uid(),updated_at=now();
  update matches set status='final',updated_at=now() where id=mid;
  insert into audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'save_result',p_match_code,old,jsonb_build_object('home_score',p_home_score,'away_score',p_away_score,'note',p_note));
end $$;

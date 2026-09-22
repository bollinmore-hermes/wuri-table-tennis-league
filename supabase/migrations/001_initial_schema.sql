-- WURI League initial schema. Apply with `supabase db reset` locally.
create extension if not exists pgcrypto;

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  name text not null, status text not null default 'active', start_date date, end_date date,
  created_at timestamptz not null default now()
);
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(), season_id uuid not null references public.seasons(id) on delete cascade,
  code text not null check (code in ('A','B')), name text not null, display_order int not null default 0,
  unique(season_id,code)
);
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(), team_code text not null unique, name text not null,
  short_name text not null, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.season_teams (
  season_id uuid not null references public.seasons(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete restrict,
  primary key(season_id,team_id)
);
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(), season_id uuid not null references public.seasons(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete restrict, match_code text not null unique,
  match_date date not null, match_time time not null, home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id), venue text not null default '',
  status text not null default 'scheduled' check(status in ('scheduled','postponed','cancelled','final')),
  published boolean not null default true, updated_at timestamptz not null default now(),
  check(home_team_id<>away_team_id)
);
create table if not exists public.match_results (
  match_id uuid primary key references public.matches(id) on delete cascade,
  home_score int not null check(home_score between 0 and 3), away_score int not null check(away_score between 0 and 3),
  note text not null default '', locked boolean not null default false,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  check((home_score=3 and away_score between 0 and 2) or (away_score=3 and home_score between 0 and 2))
);
create table if not exists public.standings_snapshots (
  id uuid primary key default gen_random_uuid(), season_id uuid not null references public.seasons(id) on delete cascade,
  group_id uuid not null references public.groups(id), team_id uuid not null references public.teams(id),
  snapshot_date date not null, points int not null check(points>=0), wins int not null check(wins>=0),
  losses int not null check(losses>=0), rank int not null check(rank>0), rank_change int not null default 0,
  unique(season_id,group_id,team_id,snapshot_date)
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '', role text check(role in ('admin','scorer')),
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key, user_id uuid references auth.users(id),
  action text not null, detail text not null default '', before_data jsonb, after_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_app_role() returns text language sql stable security definer
set search_path=public as $$ select role from public.profiles where id=auth.uid() and active=true $$;

alter table public.seasons enable row level security; alter table public.groups enable row level security;
alter table public.teams enable row level security; alter table public.season_teams enable row level security;
alter table public.matches enable row level security; alter table public.match_results enable row level security;
alter table public.standings_snapshots enable row level security; alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

do $$ begin
  create policy "public read seasons" on public.seasons for select to anon,authenticated using(true);
  create policy "public read groups" on public.groups for select to anon,authenticated using(true);
  create policy "public read teams" on public.teams for select to anon,authenticated using(true);
  create policy "public read season teams" on public.season_teams for select to anon,authenticated using(true);
  create policy "public read matches" on public.matches for select to anon,authenticated using(published=true);
  create policy "public read results" on public.match_results for select to anon,authenticated using(true);
  create policy "public read snapshots" on public.standings_snapshots for select to anon,authenticated using(true);
  create policy "profile read own or admin" on public.profiles for select to authenticated using(id=auth.uid() or public.current_app_role()='admin');
  create policy "admin read audits" on public.audit_logs for select to authenticated using(public.current_app_role()='admin');
exception when duplicate_object then null; end $$;

create or replace function public.get_admin_dataset() returns jsonb language plpgsql security definer set search_path=public as $$
declare sid uuid; result jsonb;
begin
  if public.current_app_role() not in ('admin','scorer') then raise exception 'permission denied'; end if;
  select id into sid from public.seasons where code='2026-autumn-second-half';
  select jsonb_build_object(
    'teams',coalesce((select jsonb_agg(jsonb_build_object('team_code',t.team_code,'name',t.name,'short_name',t.short_name,'group',g.code,'active',t.active) order by t.team_code) from teams t join season_teams st on st.team_id=t.id join groups g on g.id=st.group_id where st.season_id=sid),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'group',g.code,'date',m.match_date,'time',to_char(m.match_time,'HH24:MI'),'home_team_code',ht.team_code,'away_team_code',at.team_code,'venue',m.venue,'status',m.status) order by m.match_date,m.match_time,m.match_code) from matches m join groups g on g.id=m.group_id join teams ht on ht.id=m.home_team_id join teams at on at.id=m.away_team_id where m.season_id=sid),'[]'::jsonb),
    'results',coalesce((select jsonb_agg(jsonb_build_object('match_code',m.match_code,'home_score',r.home_score,'away_score',r.away_score,'status','final','note',r.note)) from match_results r join matches m on m.id=r.match_id where m.season_id=sid),'[]'::jsonb),
    'snapshots',coalesce((select jsonb_agg(jsonb_build_object('group',g.code,'snapshot_date',s.snapshot_date,'team_code',t.team_code,'points',s.points,'wins',s.wins,'losses',s.losses,'rank',s.rank,'rank_change',s.rank_change)) from standings_snapshots s join groups g on g.id=s.group_id join teams t on t.id=s.team_id where s.season_id=sid),'[]'::jsonb)
  ) into result;
  return result;
end $$;

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
    if not ((((row->>'home_score')::int)=3 and (row->>'away_score')::int between 0 and 2) or (((row->>'away_score')::int)=3 and (row->>'home_score')::int between 0 and 2)) then raise exception 'invalid score'; end if;
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
  if not ((p_home_score=3 and p_away_score between 0 and 2) or (p_away_score=3 and p_home_score between 0 and 2)) then raise exception 'invalid score'; end if;
  select m.id,to_jsonb(r) into mid,old from matches m left join match_results r on r.match_id=m.id where m.match_code=p_match_code;
  if mid is null then raise exception 'unknown match'; end if;
  if exists(select 1 from match_results where match_id=mid and locked=true) and public.current_app_role()<>'admin' then raise exception 'result locked'; end if;
  insert into match_results(match_id,home_score,away_score,note,updated_by) values(mid,p_home_score,p_away_score,coalesce(p_note,''),auth.uid())
  on conflict(match_id) do update set home_score=excluded.home_score,away_score=excluded.away_score,note=excluded.note,updated_by=auth.uid(),updated_at=now();
  update matches set status='final',updated_at=now() where id=mid;
  insert into audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'save_result',p_match_code,old,jsonb_build_object('home_score',p_home_score,'away_score',p_away_score,'note',p_note));
end $$;

grant execute on function public.get_admin_dataset() to authenticated;
grant execute on function public.import_league_data(jsonb) to authenticated;
grant execute on function public.save_match_result(text,int,int,text) to authenticated;

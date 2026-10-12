-- Issue #53: a daily capability grants report-only access, never official writes.
create table public.daily_report_links (
 id uuid primary key default gen_random_uuid(), season_id uuid not null references public.seasons(id),
 match_date date not null, token text not null unique default replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
 active boolean not null default true, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 window_started_at timestamptz not null default now(), submissions integer not null default 0
);
create unique index daily_report_one_active on public.daily_report_links(season_id,match_date) where active;
create table public.referee_reports (
 id uuid primary key default gen_random_uuid(), match_id uuid not null references public.matches(id),
 link_id uuid not null references public.daily_report_links(id), home_score integer not null, away_score integer not null,
 created_at timestamptz not null default now(), disposition text not null default 'pending' check(disposition in ('pending','adopted','reviewed')),
 check((home_score=3 and away_score=0) or (home_score=0 and away_score=3) or (home_score=2 and away_score=1) or (home_score=1 and away_score=2)),
 unique(match_id,home_score,away_score)
);
create table public.referee_report_requests (
 link_id uuid not null references public.daily_report_links(id), request_id uuid not null,
 match_id uuid not null references public.matches(id), report_id uuid not null references public.referee_reports(id),
 home_score integer not null, away_score integer not null, primary key(link_id,request_id)
);
create table public.result_review_requests (
 request_id uuid primary key, actor_id uuid not null references auth.users(id), match_id uuid not null references public.matches(id),
 payload jsonb not null, receipt jsonb not null, created_at timestamptz not null default now()
);
alter table public.daily_report_links enable row level security;
alter table public.referee_reports enable row level security;
alter table public.referee_report_requests enable row level security;
alter table public.result_review_requests enable row level security;
revoke all on public.daily_report_links,public.referee_reports,public.referee_report_requests,public.result_review_requests from public,anon,authenticated;

create function public.manage_daily_report_link(p_season_code text,p_date date,p_action text default 'get') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare sid uuid; row public.daily_report_links; prior jsonb;
begin
 if public.current_app_role() is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
 if p_date is null or p_action is null or p_action not in ('get','create','rotate','revoke') then raise exception 'invalid link request'; end if;
 select id into sid from public.seasons where code=p_season_code;
 if sid is null or not exists(select 1 from public.matches where season_id=sid and match_date=p_date) then raise exception 'unknown matchday'; end if;
 -- Serialize concurrent create/rotate even when no active row exists.
 perform 1 from public.seasons where id=sid for update;
 select * into row from public.daily_report_links where season_id=sid and match_date=p_date and active for update;
 prior=jsonb_build_object('link_id',row.id,'active',row.active);
 if p_action in ('revoke','rotate') then
  update public.daily_report_links set active=false where id=row.id; row=null;
 end if;
 if p_action in ('create','rotate') and row.id is null then
  insert into public.daily_report_links(season_id,match_date,created_by) values(sid,p_date,auth.uid()) returning * into row;
 end if;
 if p_action<>'get' then
  insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'daily_report_link_'||p_action,p_season_code||' '||p_date,prior,jsonb_build_object('link_id',row.id,'active',row.active));
 end if;
 return jsonb_build_object('date',p_date,'season_code',p_season_code,'active',coalesce(row.active,false),'token',row.token);
end $$;

create function public.get_daily_report_schedule(p_token text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare link public.daily_report_links; out_data jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid or revoked link' using errcode='42501'; end if;
 select * into link from public.daily_report_links where token=p_token and active;
 if link.id is null then raise exception 'invalid or revoked link' using errcode='42501'; end if;
 select jsonb_build_object('date',link.match_date,'season',s.name,'matches',coalesce((
  select jsonb_agg(jsonb_build_object('match_code',m.match_code,'group',g.code,'time',to_char(m.match_time,'HH24:MI'),
   'home_name',h.name,'away_name',a.name,'completed',exists(select 1 from public.match_results r where r.match_id=m.id),
   'reportable',m.status not in ('cancelled','postponed') and not m.locked and not exists(select 1 from public.match_results r where r.match_id=m.id),
   'reported',exists(select 1 from public.referee_reports r where r.match_id=m.id)) order by m.match_time,m.match_code)
  from public.matches m join public.groups g on g.id=m.group_id join public.teams h on h.id=m.home_team_id join public.teams a on a.id=m.away_team_id
  where m.season_id=link.season_id and m.match_date=link.match_date),'[]'::jsonb)) into out_data from public.seasons s where s.id=link.season_id;
 return out_data;
end $$;

create function public.submit_referee_report(p_token text,p_match_code text,p_request_id uuid,p_home_score integer,p_away_score integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare link public.daily_report_links; m public.matches; req public.referee_report_requests; rid uuid;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_request_id is null or p_home_score is null or p_away_score is null or
  not ((p_home_score=3 and p_away_score=0) or (p_home_score=0 and p_away_score=3) or (p_home_score=2 and p_away_score=1) or (p_home_score=1 and p_away_score=2)) then raise exception 'invalid report input'; end if;
 select * into link from public.daily_report_links where token=p_token and active for update;
 if link.id is null then raise exception 'invalid or revoked link' using errcode='42501'; end if;
 select * into m from public.matches where match_code=p_match_code and season_id=link.season_id and match_date=link.match_date for update;
 if m.id is null then raise exception 'match outside daily link' using errcode='42501'; end if;
 select * into req from public.referee_report_requests where link_id=link.id and request_id=p_request_id;
 if req.request_id is not null then
  if req.match_id<>m.id or req.home_score<>p_home_score or req.away_score<>p_away_score then raise exception 'request identity conflict'; end if;
  return jsonb_build_object('status','received','match_code',m.match_code,'request_id',p_request_id);
 end if;
 if m.locked or m.status in ('cancelled','postponed') or exists(select 1 from public.match_results where match_id=m.id) then raise exception 'reporting closed'; end if;
 if link.window_started_at<now()-interval '10 minutes' then
  update public.daily_report_links set window_started_at=now(),submissions=0 where id=link.id; link.submissions=0;
 end if;
 if link.submissions>=120 then raise exception 'report rate limited'; end if;
 update public.daily_report_links set submissions=submissions+1 where id=link.id;
 insert into public.referee_reports(match_id,link_id,home_score,away_score) values(m.id,link.id,p_home_score,p_away_score)
 on conflict(match_id,home_score,away_score) do nothing returning id into rid;
 if rid is null then select id into rid from public.referee_reports where match_id=m.id and home_score=p_home_score and away_score=p_away_score; end if;
 insert into public.referee_report_requests(link_id,request_id,match_id,report_id,home_score,away_score) values(link.id,p_request_id,m.id,rid,p_home_score,p_away_score);
 return jsonb_build_object('status','received','match_code',m.match_code,'request_id',p_request_id);
end $$;

create function public.get_referee_report_status(p_token text,p_match_code text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare link public.daily_report_links; mid uuid;
begin
 select * into link from public.daily_report_links where token=p_token and active for update;
 if link.id is null or p_request_id is null then raise exception 'invalid or revoked link' using errcode='42501'; end if;
 -- Same serialization order as submit: a status check waits for an in-flight original transaction.
 select id into mid from public.matches where match_code=p_match_code and season_id=link.season_id and match_date=link.match_date for update;
 if mid is null then raise exception 'match outside daily link' using errcode='42501'; end if;
 if exists(select 1 from public.referee_report_requests where link_id=link.id and request_id=p_request_id and match_id<>mid) then raise exception 'request identity conflict'; end if;
 return jsonb_build_object('match_code',p_match_code,'request_id',p_request_id,'status',case when exists(select 1 from public.referee_report_requests where link_id=link.id and request_id=p_request_id and match_id=mid) then 'received' else 'not_received' end);
end $$;

create function public.get_result_review_queue(p_season_code text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare role_name text; sid uuid;
begin
 role_name=public.current_app_role();
 if role_name is null or role_name not in ('admin','scorer') then raise exception 'permission denied' using errcode='42501'; end if;
 select id into sid from public.seasons where code=p_season_code;
 if sid is null then raise exception 'unknown season'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'match_code',m.match_code,'home_score',r.home_score,'away_score',r.away_score,'created_at',r.created_at,'disposition',r.disposition) order by r.created_at,r.id)
  from public.referee_reports r join public.matches m on m.id=r.match_id where m.season_id=sid),'[]'::jsonb);
end $$;

create function public.confirm_reported_result(p_season_code text,p_match_code text,p_request_id uuid,p_report_id uuid,p_home_score integer,p_away_score integer,p_note text,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare role_name text; m public.matches; chosen public.referee_reports; req public.result_review_requests; payload jsonb; receipt jsonb; prior jsonb;
begin
 role_name=public.current_app_role();
 if role_name is null or role_name not in ('admin','scorer') then raise exception 'permission denied' using errcode='42501'; end if;
 if p_request_id is null or p_expected_version is null or p_home_score is null or p_away_score is null or char_length(coalesce(p_note,''))>500 or
  not ((p_home_score=3 and p_away_score=0) or (p_home_score=0 and p_away_score=3) or (p_home_score=2 and p_away_score=1) or (p_home_score=1 and p_away_score=2)) then raise exception 'invalid result input'; end if;
 select mt.* into m from public.matches mt join public.seasons s on s.id=mt.season_id where s.code=p_season_code and mt.match_code=p_match_code for update of mt;
 if m.id is null then raise exception 'unknown match'; end if;
 payload=jsonb_build_object('match_code',p_match_code,'report_id',p_report_id,'home_score',p_home_score,'away_score',p_away_score,'note',coalesce(p_note,''),'expected_version',p_expected_version);
 select * into req from public.result_review_requests where request_id=p_request_id;
 if req.request_id is not null then
  if req.actor_id<>auth.uid() or req.match_id<>m.id or req.payload<>payload then raise exception 'request identity conflict'; end if;
  return req.receipt;
 end if;
 if (m.locked or exists(select 1 from public.match_results where match_id=m.id and locked)) and role_name is distinct from 'admin' then raise exception 'result locked' using errcode='42501'; end if;
 if p_report_id is not null then
  select * into chosen from public.referee_reports where id=p_report_id and match_id=m.id;
  if chosen.id is null or chosen.home_score<>p_home_score or chosen.away_score<>p_away_score then raise exception 'report source mismatch'; end if;
 end if;
 select to_jsonb(r) into prior from public.match_results r where r.match_id=m.id;
 -- Explicit version check also for NULL, before calling the established write contract.
 if coalesce((prior->>'version')::integer,0)<>p_expected_version then raise exception 'version conflict' using errcode='40001'; end if;
 -- Admin may correct a match lock; retain lock state and do not alter schedule.
 if m.locked then update public.matches set locked=false where id=m.id; end if;
 perform public.save_match_result(p_match_code,p_home_score,p_away_score,p_note,p_expected_version);
 if m.locked then update public.matches set locked=true where id=m.id; end if;
 update public.referee_reports set disposition=case when id=p_report_id then 'adopted' else 'reviewed' end where match_id=m.id;
 select jsonb_build_object('match_code',m.match_code,'request_id',p_request_id,'home_score',r.home_score,'away_score',r.away_score,'version',r.version,'report_id',p_report_id,'locked',r.locked,'note',r.note) into receipt from public.match_results r where r.match_id=m.id;
 insert into public.result_review_requests(request_id,actor_id,match_id,payload,receipt) values(p_request_id,auth.uid(),m.id,payload,receipt);
 insert into public.audit_logs(user_id,action,detail,before_data,after_data) values(auth.uid(),'confirm_reported_result',m.match_code,prior,receipt);
 return receipt;
end $$;

create function public.get_result_review_status(p_season_code text,p_match_code text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare role_name text; mid uuid; req public.result_review_requests;
begin
 role_name=public.current_app_role();
 if role_name is null or role_name not in ('admin','scorer') then raise exception 'permission denied' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'invalid request'; end if;
 select m.id into mid from public.matches m join public.seasons s on s.id=m.season_id where s.code=p_season_code and m.match_code=p_match_code for update of m;
 if mid is null then raise exception 'unknown match'; end if;
 select * into req from public.result_review_requests where request_id=p_request_id;
 if req.request_id is not null and (req.match_id<>mid or req.actor_id<>auth.uid()) then raise exception 'request identity conflict' using errcode='42501'; end if;
 return jsonb_build_object('status',case when req.request_id is null then 'not_saved' else 'saved' end,'receipt',req.receipt);
end $$;

revoke all on function public.manage_daily_report_link(text,date,text),public.get_daily_report_schedule(text),public.submit_referee_report(text,text,uuid,integer,integer),public.get_referee_report_status(text,text,uuid),public.get_result_review_queue(text),public.confirm_reported_result(text,text,uuid,uuid,integer,integer,text,integer),public.get_result_review_status(text,text,uuid) from public,anon,authenticated;
grant execute on function public.manage_daily_report_link(text,date,text),public.get_result_review_queue(text),public.confirm_reported_result(text,text,uuid,uuid,integer,integer,text,integer),public.get_result_review_status(text,text,uuid) to authenticated;
grant execute on function public.get_daily_report_schedule(text),public.submit_referee_report(text,text,uuid,integer,integer),public.get_referee_report_status(text,text,uuid) to anon,authenticated;

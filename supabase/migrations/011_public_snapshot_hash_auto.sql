-- Public content hashes, server-only automation, and no browser-authorized cron.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.public_snapshot_canonical(v jsonb) returns text
language plpgsql immutable strict set search_path=pg_catalog,public,pg_temp as $$
declare result text; n numeric;
begin
 case jsonb_typeof(v)
 when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.public_snapshot_canonical(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(v);
 when 'array' then select '['||coalesce(string_agg(c,',' order by c collate "C"),'')||']' into result from (select public.public_snapshot_canonical(value) c from jsonb_array_elements(v)) x;
 when 'number' then n=(v#>>'{}')::numeric; if n<>trunc(n) or abs(n)>9007199254740991 then raise exception 'unsafe public number'; end if;result=trunc(n)::text;
 else result=v::text;
 end case; return result;
end $$;
create or replace function public.public_snapshot_dataset(p_season_code text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 with raw as (select public.get_public_league(p_season_code) d)
 select jsonb_set(d,'{teams}',coalesce((select jsonb_agg(r||jsonb_build_object('short_name',coalesce(nullif(r->>'short_name',''),r->>'name'),'description',coalesce(r->>'description',''),'logo_path',coalesce(r->>'logo_path','')) order by pos) from jsonb_array_elements(d->'teams') with ordinality as t(r,pos)),'[]'::jsonb)) from raw
$$;
create or replace function public.get_public_league_snapshot(p_season_code text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,extensions,pg_temp as $$
 with data as materialized(select public.public_snapshot_dataset(p_season_code) d)
 select jsonb_build_object('data',d,'contentHash',encode(extensions.digest(convert_to(public.public_snapshot_canonical(d),'UTF8'),'sha256'),'hex'),'hashAlgorithm','public-json-sha256-v1') from data
$$;
revoke all on function public.public_snapshot_canonical(jsonb),public.public_snapshot_dataset(text),public.get_public_league_snapshot(text) from public,anon,authenticated;
grant execute on function public.get_public_league_snapshot(text) to anon,authenticated,service_role;
grant execute on function public.public_snapshot_canonical(jsonb),public.public_snapshot_dataset(text) to service_role;

alter table public.snapshot_publications add column publication_mode text not null default 'manual' check(publication_mode in ('manual','automatic')),
 add column requested_hash text check(requested_hash ~ '^[a-f0-9]{64}$'),
 add column content_hash text check(content_hash ~ '^[a-f0-9]{64}$'),
 add column season_code text not null default '2026-autumn-second-half';
create table public.snapshot_automation (
 season_code text primary key, project_ref text not null check(project_ref in ('vppjcjfbcoxzofcuxmzz','zofiiibgnjuodgrzhkpn')),
 enabled boolean not null default false,
 published_hash text check(published_hash ~ '^[a-f0-9]{64}$'), published_request_id uuid references public.snapshot_publications(id),
 last_check_at timestamptz,last_current_hash text,last_http_request bigint,
 failure_count integer not null default 0,next_retry_at timestamptz,last_error text,
 last_confirmed_at timestamptz,last_compute_ms numeric
);
alter table public.snapshot_automation enable row level security;
revoke all on public.snapshot_automation from public,anon,authenticated;
grant select,insert,update on public.snapshot_automation to service_role;

create or replace function public.automatic_public_snapshot_state(p_season_code text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object('enabled',a.enabled,'needs_publish',a.published_hash is distinct from (public.get_public_league_snapshot(a.season_code)->>'contentHash'),
 'published_hash',a.published_hash,'pending_id',(select id from public.snapshot_publications where status in ('queued','running','dispatch_unknown') order by created_at desc limit 1),
 'failure_count',a.failure_count,'retry_allowed',a.failure_count<3 and (a.next_retry_at is null or a.next_retry_at<=now())) from public.snapshot_automation a where a.season_code=p_season_code
$$;
-- Replace only reservation control; authorization and league records are unchanged.
create or replace function public.reserve_public_snapshot(p_actor_id uuid,p_source_commit text,p_source_tag text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; request public.snapshot_publications%rowtype;
begin
 select role into app_role from public.profiles where id=p_actor_id and active;
 if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
 if p_source_commit is null or p_source_commit !~ '^[a-f0-9]{40}$' or (p_source_tag is not null and p_source_tag !~ '^v[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$') then raise exception 'invalid source'; end if;
 perform pg_advisory_xact_lock(73491010);
 if exists(select 1 from public.snapshot_publications where created_at>now()-interval '1 minute' or status in ('queued','running','dispatch_unknown')) then raise exception 'publication busy' using errcode='P0001'; end if;
 insert into public.snapshot_publications(actor_id,source_commit,source_tag) values(p_actor_id,p_source_commit,p_source_tag) returning * into request;
 insert into public.audit_logs(user_id,action,detail,after_data) values(p_actor_id,'publish_snapshot_requested',request.id::text,jsonb_build_object('source_commit',p_source_commit,'source_tag',p_source_tag));
 return to_jsonb(request);
end $$;
create or replace function public.reserve_automatic_public_snapshot(p_season_code text,p_source_commit text,p_source_tag text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare cfg public.snapshot_automation%rowtype; request public.snapshot_publications%rowtype; current_hash text;
begin
 if p_source_commit is null or p_source_commit !~ '^[a-f0-9]{40}$' or (p_source_tag is not null and p_source_tag !~ '^v[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$') then raise exception 'invalid source'; end if;
 perform pg_advisory_xact_lock(73491010);
 select * into cfg from public.snapshot_automation where season_code=p_season_code for update;
 if not found or not cfg.enabled then raise exception 'automation disabled' using errcode='42501'; end if;
 if cfg.project_ref='zofiiibgnjuodgrzhkpn' and p_source_tag is null then raise exception 'production tag required';end if;
 if cfg.failure_count>=3 or cfg.next_retry_at>now() then return null;end if;
 if exists(select 1 from public.snapshot_publications where created_at>now()-interval '1 minute' or status in ('queued','running','dispatch_unknown')) then raise exception 'publication busy' using errcode='P0001';end if;
 current_hash=public.get_public_league_snapshot(p_season_code)->>'contentHash';
 if cfg.published_hash=current_hash then return null;end if;
 insert into public.snapshot_publications(actor_id,source_commit,source_tag,publication_mode,requested_hash,season_code) values(null,p_source_commit,p_source_tag,'automatic',current_hash,p_season_code) returning * into request;
 insert into public.audit_logs(user_id,action,detail,after_data) values(null,'auto_publish_snapshot_requested',request.id::text,jsonb_build_object('source_commit',p_source_commit,'source_tag',p_source_tag,'content_hash',current_hash));
 return to_jsonb(request);
end $$;
create or replace function public.confirm_public_snapshot_hash(p_request_id uuid,p_season_code text,p_content_hash text,p_source_commit text,p_source_tag text,p_published_at timestamptz) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare request public.snapshot_publications%rowtype;
begin
 if p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$' or p_source_commit !~ '^[a-f0-9]{40}$' or p_published_at is null or p_published_at>now()+interval '5 minutes' then raise exception 'invalid publication confirmation';end if;
 perform pg_advisory_xact_lock(73491010);
 if p_request_id is not null then
  select * into request from public.snapshot_publications where id=p_request_id for update;
  if not found or request.status='failed' or request.season_code<>p_season_code or request.source_commit<>p_source_commit or request.source_tag is distinct from p_source_tag then raise exception 'publication confirmation mismatch';end if;
  update public.snapshot_publications set status='published',content_hash=p_content_hash,published_at=p_published_at where id=p_request_id;
 else
  if exists(select 1 from public.snapshot_automation where season_code=p_season_code and published_hash is not null) then raise exception 'bootstrap already completed';end if;
 end if;
 -- Store ONLY the hash that the verified deployed snapshot actually contained.
 update public.snapshot_automation set published_hash=p_content_hash,published_request_id=p_request_id,last_confirmed_at=now(),failure_count=0,next_retry_at=null,last_error=null where season_code=p_season_code;
end $$;
create or replace function public.record_snapshot_automation_failure(p_season_code text) returns void
language sql security definer set search_path=pg_catalog,public,pg_temp as $$
 update public.snapshot_automation set failure_count=least(failure_count+1,3),next_retry_at=now()+interval '15 minutes',last_error='publication_check_failed' where season_code=p_season_code
$$;
revoke all on function public.automatic_public_snapshot_state(text),public.reserve_automatic_public_snapshot(text,text,text),public.confirm_public_snapshot_hash(uuid,text,text,text,text,timestamptz),public.record_snapshot_automation_failure(text) from public,anon,authenticated;
grant execute on function public.automatic_public_snapshot_state(text),public.reserve_automatic_public_snapshot(text,text,text),public.confirm_public_snapshot_hash(uuid,text,text,text,text,timestamptz),public.record_snapshot_automation_failure(text) to service_role;

create or replace function public.check_public_snapshot_schedule() returns text
language plpgsql security definer set search_path=pg_catalog,public,extensions,vault,net,pg_temp as $$
declare cfg public.snapshot_automation%rowtype; current_hash text; secret text; request bigint; pending boolean; started timestamptz;
begin
 if not pg_try_advisory_xact_lock(73491011) then return 'check_busy';end if;
 select * into cfg from public.snapshot_automation where enabled limit 1;
 if not found then return 'disabled';end if;
 started=clock_timestamp();current_hash=public.get_public_league_snapshot(cfg.season_code)->>'contentHash';
 update public.snapshot_automation set last_check_at=now(),last_current_hash=current_hash,last_compute_ms=extract(epoch from clock_timestamp()-started)*1000 where season_code=cfg.season_code;
 select exists(select 1 from public.snapshot_publications where status in ('queued','running','dispatch_unknown')) into pending;
 if not pending and cfg.published_hash=current_hash then return 'unchanged';end if;
 if not pending and (cfg.failure_count>=3 or cfg.next_retry_at>now()) then return 'retry_paused';end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='wuri_snapshot_cron_secret';
 if secret is null or length(secret)<>64 then update public.snapshot_automation set last_error='cron_not_configured' where season_code=cfg.season_code;return 'not_configured';end if;
 select net.http_post(url:='https://'||cfg.project_ref||'.supabase.co/functions/v1/auto-publish-public-snapshot',
 headers:=jsonb_build_object('Content-Type','application/json','X-Snapshot-Cron-Secret',secret),body:='{}'::jsonb,timeout_milliseconds:=30000) into request;
 update public.snapshot_automation set last_http_request=request where season_code=cfg.season_code;
 return case when pending then 'reconcile_requested' else 'publication_check_requested' end;
end $$;
revoke all on function public.check_public_snapshot_schedule() from public,anon,authenticated,service_role;
-- Owner-only scheduling; automation remains disabled until an explicit configuration row is enabled.
select cron.schedule('wuri-public-hash-check','*/5 * * * *','select public.check_public_snapshot_schedule();');

-- Install disabled: enable the new delivery method only after Test deployment/readback.
alter table public.snapshot_automation add column delivery_method text not null default 'actions' check(delivery_method in ('actions','storage'));
alter table public.snapshot_publications add column delivery_method text not null default 'actions' check(delivery_method in ('actions','storage')),
 add column object_path text, add column snapshot_id text check(snapshot_id ~ '^[a-f0-9]{64}$');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('wuri-public-snapshots','wuri-public-snapshots',true,2000000,array['application/json'])
 on conflict(id) do nothing;
-- Existing object policies target team-logos only; do not grant browser snapshot writes.
create table public.storage_snapshot_current (
 season_code text primary key references public.snapshot_automation(season_code),
 request_id uuid not null references public.snapshot_publications(id)
);
alter table public.storage_snapshot_current enable row level security;
revoke all on public.storage_snapshot_current from public,anon,authenticated;
grant select,insert,update on public.storage_snapshot_current to service_role;

create or replace function public.snapshot_publication_delivery(p_season_code text) returns text
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select coalesce((select delivery_method from public.snapshot_automation where season_code=p_season_code),'actions')
$$;
create or replace function public.get_storage_public_snapshot_pointer(p_season_code text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object('schemaVersion',1,'environment',case a.project_ref when 'vppjcjfbcoxzofcuxmzz' then 'test' else 'production' end,
 'projectRef',a.project_ref,'seasonCode',p.season_code,'bucket','wuri-public-snapshots','objectPath',p.object_path,
 'requestId',p.id,'sourceCommit',p.source_commit,'sourceTag',p.source_tag,'contentHash',p.content_hash,'snapshotId',p.snapshot_id,
 'generatedAt',p.published_at)
 from public.storage_snapshot_current c join public.snapshot_publications p on p.id=c.request_id
 join public.snapshot_automation a on a.season_code=c.season_code
 where c.season_code=p_season_code and p.status='published' and p.delivery_method='storage'
$$;
create or replace function public.reserve_storage_public_snapshot(p_season_code text,p_actor_id uuid,p_automatic boolean,p_source_commit text,p_source_tag text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare cfg public.snapshot_automation%rowtype; request public.snapshot_publications%rowtype; snapshot jsonb;
begin
 if p_season_code is distinct from '2026-autumn-second-half' or p_automatic is null then raise exception 'invalid season';end if;
 if p_automatic then
  if p_actor_id is not null then raise exception 'automatic actor forbidden' using errcode='42501';end if;
 elsif not exists(select 1 from public.profiles where id=p_actor_id and role='admin' and active) then raise exception 'admin role required' using errcode='42501';end if;
 if p_source_commit is null or p_source_commit !~ '^[a-f0-9]{40}$' or (p_source_tag is not null and p_source_tag !~ '^v[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$') then raise exception 'invalid source';end if;
 perform pg_advisory_xact_lock(73491010);
 select * into cfg from public.snapshot_automation where season_code=p_season_code for update;
 if not found or cfg.delivery_method<>'storage' or (p_automatic and not cfg.enabled) then raise exception 'storage delivery disabled' using errcode='42501';end if;
 if cfg.project_ref='zofiiibgnjuodgrzhkpn' and p_source_tag is null then raise exception 'production tag required';end if;
 if p_automatic and (cfg.failure_count>=3 or cfg.next_retry_at>now()) then return null;end if;
 if exists(select 1 from public.snapshot_publications where status in ('queued','running','dispatch_unknown')) then raise exception 'publication busy' using errcode='P0001';end if;
 snapshot=public.get_public_league_snapshot(p_season_code);
 if cfg.published_hash=snapshot->>'contentHash' and exists(select 1 from public.storage_snapshot_current where season_code=p_season_code) then return null;end if;
 insert into public.snapshot_publications(actor_id,source_commit,source_tag,publication_mode,requested_hash,season_code,status,delivery_method,created_at)
 values(p_actor_id,p_source_commit,p_source_tag,case when p_automatic then 'automatic' else 'manual' end,snapshot->>'contentHash',p_season_code,'running','storage',date_trunc('milliseconds',now())) returning * into request;
 update public.snapshot_publications set object_path=p_season_code||'/'||p_source_commit||'/'||request.id||'-'||request.requested_hash||'.json' where id=request.id returning * into request;
 insert into public.audit_logs(user_id,action,detail,after_data) values(p_actor_id,case when p_automatic then 'auto_publish_snapshot_requested' else 'publish_snapshot_requested' end,request.id::text,jsonb_build_object('delivery_method','storage','source_commit',p_source_commit,'source_tag',p_source_tag));
 return to_jsonb(request)||jsonb_build_object('snapshot',snapshot);
end $$;
create or replace function public.confirm_storage_public_snapshot(p_request_id uuid,p_content_hash text,p_snapshot_id text,p_generated_at timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare request public.snapshot_publications%rowtype;
begin
 perform pg_advisory_xact_lock(73491010);
 select * into request from public.snapshot_publications where id=p_request_id for update;
 if not found or request.delivery_method<>'storage' or request.status='failed' or p_content_hash is distinct from request.requested_hash or p_snapshot_id is null or p_snapshot_id !~ '^[a-f0-9]{64}$' or p_generated_at is distinct from request.created_at then raise exception 'invalid storage confirmation';end if;
 if request.status='published' then
  if request.snapshot_id is distinct from p_snapshot_id then raise exception 'confirmation conflict';end if;
  return to_jsonb(request); -- An old successful receipt may never roll the current pointer back.
 end if;
 update public.snapshot_publications set status='published',content_hash=p_content_hash,snapshot_id=p_snapshot_id,published_at=p_generated_at where id=p_request_id returning * into request;
 insert into public.storage_snapshot_current(season_code,request_id) values(request.season_code,p_request_id) on conflict(season_code) do update set request_id=excluded.request_id;
 update public.snapshot_automation set published_hash=p_content_hash,published_request_id=p_request_id,last_confirmed_at=now(),failure_count=0,next_retry_at=null,last_error=null where season_code=request.season_code;
 return to_jsonb(request);
end $$;
revoke all on function public.snapshot_publication_delivery(text),public.get_storage_public_snapshot_pointer(text),public.reserve_storage_public_snapshot(text,uuid,boolean,text,text),public.confirm_storage_public_snapshot(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.snapshot_publication_delivery(text),public.get_storage_public_snapshot_pointer(text),public.reserve_storage_public_snapshot(text,uuid,boolean,text,text),public.confirm_storage_public_snapshot(uuid,text,text,timestamptz) to service_role;

-- Prevent an old in-flight Actions caller reserving after the delivery switch.
alter function public.reserve_public_snapshot(uuid,text,text) rename to reserve_actions_public_snapshot;
alter function public.reserve_automatic_public_snapshot(text,text,text) rename to reserve_actions_automatic_public_snapshot;
revoke all on function public.reserve_actions_public_snapshot(uuid,text,text),public.reserve_actions_automatic_public_snapshot(text,text,text) from public,anon,authenticated,service_role;
create function public.reserve_public_snapshot(p_actor_id uuid,p_source_commit text,p_source_tag text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(73491010);
 if public.snapshot_publication_delivery('2026-autumn-second-half')<>'actions' then raise exception 'actions delivery disabled' using errcode='42501';end if;
 return public.reserve_actions_public_snapshot(p_actor_id,p_source_commit,p_source_tag);
end $$;
create function public.reserve_automatic_public_snapshot(p_season_code text,p_source_commit text,p_source_tag text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(73491010);
 if public.snapshot_publication_delivery(p_season_code)<>'actions' then raise exception 'actions delivery disabled' using errcode='42501';end if;
 return public.reserve_actions_automatic_public_snapshot(p_season_code,p_source_commit,p_source_tag);
end $$;
revoke all on function public.reserve_public_snapshot(uuid,text,text),public.reserve_automatic_public_snapshot(text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_public_snapshot(uuid,text,text),public.reserve_automatic_public_snapshot(text,text,text) to service_role;

create or replace function public.automatic_public_snapshot_state(p_season_code text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select jsonb_build_object('enabled',a.enabled,'delivery_method',a.delivery_method,
 'needs_publish',a.published_hash is distinct from (public.get_public_league_snapshot(a.season_code)->>'contentHash') or (a.delivery_method='storage' and not exists(select 1 from public.storage_snapshot_current where season_code=a.season_code)),
 'published_hash',a.published_hash,'pending_id',(select id from public.snapshot_publications where status in ('queued','running','dispatch_unknown') order by created_at desc limit 1),
 'failure_count',a.failure_count,'retry_allowed',a.failure_count<3 and (a.next_retry_at is null or a.next_retry_at<=now())) from public.snapshot_automation a where a.season_code=p_season_code
$$;
create or replace function public.get_publication_status_summary(p_season_code text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,cron,pg_temp as $$
 with cfg as (select * from public.snapshot_automation where season_code=p_season_code),
 pending as (select id,status from public.snapshot_publications where status in ('queued','running','dispatch_unknown') order by created_at desc limit 1),
 latest as (select max(created_at) created_at from public.snapshot_publications where delivery_method='actions'),
 published as (select max(published_at) published_at from public.snapshot_publications where season_code=p_season_code and status='published'),
 job as (select schedule from cron.job where jobname='wuri-public-hash-check' and active)
 select jsonb_build_object('delivery_method',cfg.delivery_method,'verified_hash_known',cfg.published_hash is not null,
 'needs_publish',cfg.published_hash is distinct from (public.get_public_league_snapshot(cfg.season_code)->>'contentHash') or (cfg.delivery_method='storage' and not exists(select 1 from public.storage_snapshot_current where season_code=p_season_code)),
 'pending_request_id',(select id from pending),'pending_status',(select status from pending),
 'cooldown_until',case when latest.created_at>now()-interval '1 minute' then latest.created_at+interval '1 minute' else null end,
 'last_published_at',published.published_at,'automatic_enabled',cfg.enabled,
 'interval_seconds',(select case schedule when '*/2 * * * *' then 120 when '*/5 * * * *' then 300 else null end from job)) from cfg cross join latest cross join published
$$;
-- Storage bootstrap must run even if the last Actions hash already matches.
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
 if not pending and cfg.published_hash=current_hash and (cfg.delivery_method='actions' or exists(select 1 from public.storage_snapshot_current where season_code=cfg.season_code)) then return 'unchanged';end if;
 if not pending and (cfg.failure_count>=3 or cfg.next_retry_at>now()) then return 'retry_paused';end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='wuri_snapshot_cron_secret';
 if secret is null or length(secret)<>64 then update public.snapshot_automation set last_error='cron_not_configured' where season_code=cfg.season_code;return 'not_configured';end if;
 select net.http_post(url:='https://'||cfg.project_ref||'.supabase.co/functions/v1/auto-publish-public-snapshot',headers:=jsonb_build_object('Content-Type','application/json','X-Snapshot-Cron-Secret',secret),body:='{}'::jsonb,timeout_milliseconds:=30000) into request;
 update public.snapshot_automation set last_http_request=request where season_code=cfg.season_code;
 return case when pending then 'reconcile_requested' else 'publication_check_requested' end;
end $$;

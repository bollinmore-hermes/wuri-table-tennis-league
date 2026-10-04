-- Service-only compact state. No browser access to controls, cron or privileged RPCs.
create or replace function public.get_publication_status_summary(p_season_code text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,cron,pg_temp as $$
 with cfg as (select * from public.snapshot_automation where season_code=p_season_code),
 pending as (select id,status from public.snapshot_publications where status in ('queued','running','dispatch_unknown') order by created_at desc limit 1),
 latest as (select max(created_at) created_at from public.snapshot_publications),
 published as (select max(published_at) published_at from public.snapshot_publications where season_code=p_season_code and status='published'),
 job as (select schedule from cron.job where jobname='wuri-public-hash-check' and active)
 select jsonb_build_object(
 'verified_hash_known',cfg.published_hash is not null,
 'needs_publish',cfg.published_hash is distinct from (public.get_public_league_snapshot(cfg.season_code)->>'contentHash'),
 'pending_request_id',(select id from pending),'pending_status',(select status from pending),
 'cooldown_until',case when latest.created_at>now()-interval '1 minute' then latest.created_at+interval '1 minute' else null end,
 'last_published_at',published.published_at,'automatic_enabled',cfg.enabled,
 'interval_seconds',(select case schedule when '*/2 * * * *' then 120 when '*/5 * * * *' then 300 else null end from job)
 ) from cfg cross join latest cross join published
$$;
revoke all on function public.get_publication_status_summary(text) from public,anon,authenticated;
grant execute on function public.get_publication_status_summary(text) to service_role;

-- Authoritative recheck under the same lock as automatic reservation.
-- No-op manual requests must not add publication/audit records or dispatch Actions.
create or replace function public.reserve_public_snapshot(p_actor_id uuid,p_source_commit text,p_source_tag text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; request public.snapshot_publications%rowtype; published_hash text; current_hash text;
target_season constant text:='2026-autumn-second-half';
begin
 select role into app_role from public.profiles where id=p_actor_id and active;
 if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
 if p_source_commit is null or p_source_commit !~ '^[a-f0-9]{40}$' or (p_source_tag is not null and p_source_tag !~ '^v[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$') then raise exception 'invalid source'; end if;
 perform pg_advisory_xact_lock(73491010);
 if exists(select 1 from public.snapshot_publications where created_at>now()-interval '1 minute' or status in ('queued','running','dispatch_unknown')) then raise exception 'publication busy' using errcode='P0001'; end if;
 select a.published_hash into published_hash from public.snapshot_automation a where a.season_code=target_season for update;
 current_hash=public.get_public_league_snapshot(target_season)->>'contentHash';
 if published_hash=current_hash then return null;end if;
 insert into public.snapshot_publications(actor_id,source_commit,source_tag,requested_hash,season_code) values(p_actor_id,p_source_commit,p_source_tag,current_hash,target_season) returning * into request;
 insert into public.audit_logs(user_id,action,detail,after_data) values(p_actor_id,'publish_snapshot_requested',request.id::text,jsonb_build_object('source_commit',p_source_commit,'source_tag',p_source_tag));
 return to_jsonb(request);
end $$;

-- Alter exactly the existing enabled Test job; do not create another job or enable Production.
do $$
declare job_id bigint; job_count integer;
begin
 if exists(select 1 from public.snapshot_automation where project_ref='vppjcjfbcoxzofcuxmzz' and enabled) then
  select count(*),min(jobid) into job_count,job_id from cron.job where jobname='wuri-public-hash-check';
  if job_count<>1 then raise exception 'expected exactly one existing hash check job';end if;
  perform cron.alter_job(job_id:=job_id,schedule:='*/2 * * * *');
 end if;
end $$;

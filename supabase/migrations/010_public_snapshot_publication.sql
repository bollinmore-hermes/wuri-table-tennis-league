-- Publication requests are global to one environment and never browser-writable.
create table public.snapshot_publications (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id) on delete set null,
 source_commit text not null check(source_commit ~ '^[a-f0-9]{40}$'),
 source_tag text,
 created_at timestamptz not null default now(),
 status text not null default 'queued' check(status in ('queued','running','dispatch_unknown','failed','published')),
 run_id bigint,
 published_at timestamptz
);
alter table public.snapshot_publications enable row level security;
revoke all on public.snapshot_publications from public,anon,authenticated;
grant select,insert,update on public.snapshot_publications to service_role;
create or replace function public.reserve_public_snapshot(p_actor_id uuid,p_source_commit text,p_source_tag text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; request public.snapshot_publications%rowtype;
begin
 select role into app_role from public.profiles where id=p_actor_id and active;
 if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
 if p_source_commit is null or p_source_commit !~ '^[a-f0-9]{40}$' or (p_source_tag is not null and p_source_tag !~ '^v[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$') then raise exception 'invalid source'; end if;
 perform pg_advisory_xact_lock(73491010);
 if exists(select 1 from public.snapshot_publications where created_at>now()-interval '1 minute' or (status in ('queued','running','dispatch_unknown') and created_at>now()-interval '15 minutes')) then raise exception 'publication busy' using errcode='P0001'; end if;
 insert into public.snapshot_publications(actor_id,source_commit,source_tag) values(p_actor_id,p_source_commit,p_source_tag) returning * into request;
 insert into public.audit_logs(user_id,action,detail,after_data) values(p_actor_id,'publish_snapshot_requested',request.id::text,jsonb_build_object('source_commit',p_source_commit,'source_tag',p_source_tag));
 return to_jsonb(request);
end $$;
revoke all on function public.reserve_public_snapshot(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_public_snapshot(uuid,text,text) to service_role;

-- Allow permanent Auth-user deletion while preserving historical audit/update references.

alter table public.audit_logs drop constraint if exists audit_logs_user_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null;

alter table public.teams drop constraint if exists teams_updated_by_fkey;
alter table public.teams
  add constraint teams_updated_by_fkey foreign key(updated_by) references auth.users(id) on delete set null;

alter table public.matches drop constraint if exists matches_updated_by_fkey;
alter table public.matches
  add constraint matches_updated_by_fkey foreign key(updated_by) references auth.users(id) on delete set null;

alter table public.match_results drop constraint if exists match_results_updated_by_fkey;
alter table public.match_results
  add constraint match_results_updated_by_fkey foreign key(updated_by) references auth.users(id) on delete set null;

alter table public.players drop constraint if exists players_updated_by_fkey;
alter table public.players
  add constraint players_updated_by_fkey foreign key(updated_by) references auth.users(id) on delete set null;

alter table public.user_management_rate_limits
  drop constraint if exists user_management_rate_limits_operation_check;
alter table public.user_management_rate_limits
  add constraint user_management_rate_limits_operation_check
  check(operation in ('update','reset_password','delete'));

create or replace function public.consume_user_management_quota(p_actor_id uuid,p_operation text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; quota public.user_management_rate_limits%rowtype; max_attempts integer;
begin
  select p.role into app_role from public.profiles p where p.id=p_actor_id and p.active;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_operation not in ('update','reset_password','delete') then raise exception 'invalid operation'; end if;
  max_attempts=case when p_operation='reset_password' then 5 when p_operation='delete' then 10 else 30 end;
  insert into public.user_management_rate_limits(actor_id,operation,attempts)
  values(p_actor_id,p_operation,0)
  on conflict(actor_id,operation) do nothing;
  select * into quota from public.user_management_rate_limits
  where actor_id=p_actor_id and operation=p_operation for update;
  if quota.window_started_at<=now()-interval '10 minutes' then
    update public.user_management_rate_limits
    set window_started_at=now(),attempts=1,updated_at=now()
    where actor_id=p_actor_id and operation=p_operation;
    return true;
  end if;
  if quota.attempts>=max_attempts then return false; end if;
  update public.user_management_rate_limits
  set attempts=attempts+1,updated_at=now()
  where actor_id=p_actor_id and operation=p_operation;
  return true;
end $$;

revoke all on function public.consume_user_management_quota(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_user_management_quota(uuid,text) to service_role;

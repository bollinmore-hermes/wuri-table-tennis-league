create table if not exists public.user_management_rate_limits (
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check(operation in ('update','reset_password')),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check(attempts between 0 and 30),
  updated_at timestamptz not null default now(),
  primary key(actor_id,operation)
);
alter table public.user_management_rate_limits enable row level security;
revoke all on table public.user_management_rate_limits from public,anon,authenticated;

create or replace function public.consume_user_management_quota(p_actor_id uuid,p_operation text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; quota public.user_management_rate_limits%rowtype; max_attempts integer;
begin
  select p.role into app_role from public.profiles p where p.id=p_actor_id and p.active;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_operation not in ('update','reset_password') then raise exception 'invalid operation'; end if;
  max_attempts=case when p_operation='reset_password' then 5 else 30 end;
  insert into public.user_management_rate_limits(actor_id,operation,attempts) values(p_actor_id,p_operation,0) on conflict(actor_id,operation) do nothing;
  select * into quota from public.user_management_rate_limits where actor_id=p_actor_id and operation=p_operation for update;
  if quota.window_started_at<=now()-interval '10 minutes' then
    update public.user_management_rate_limits set window_started_at=now(),attempts=1,updated_at=now() where actor_id=p_actor_id and operation=p_operation;
    return true;
  end if;
  if quota.attempts>=max_attempts then return false; end if;
  update public.user_management_rate_limits set attempts=attempts+1,updated_at=now() where actor_id=p_actor_id and operation=p_operation;
  return true;
end $$;

create or replace function public.complete_user_management_update(
  p_actor_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_role text,
  p_active boolean
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
declare app_role text; before_row jsonb; result jsonb; target_email text;
begin
  select p.role into app_role from public.profiles p where p.id=p_actor_id and p.active;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  if p_user_id is null or p_role not in ('admin','scorer') or p_active is null
    or char_length(trim(coalesce(p_display_name,''))) not between 1 and 100
    or p_display_name ~ '[[:cntrl:]]'
  then raise exception 'invalid user input'; end if;
  if p_actor_id = p_user_id and (p_role <> 'admin' or not p_active) then
    raise exception 'self lockout forbidden';
  end if;
  select to_jsonb(p),coalesce(p.email,lower(u.email)) into before_row,target_email
  from public.profiles p join auth.users u on u.id=p.id where p.id=p_user_id;
  if before_row is null then raise exception 'user not found'; end if;
  update public.profiles set display_name=trim(p_display_name),role=p_role,active=p_active where id=p_user_id;
  result=jsonb_build_object(
    'id',p_user_id,'email',target_email,'display_name',trim(p_display_name),'role',p_role,'active',p_active,
    'invitation_status',case when exists(select 1 from auth.users u where u.id=p_user_id and (u.last_sign_in_at is not null or u.confirmed_at is not null)) then 'active' else 'invited' end
  );
  insert into public.audit_logs(user_id,action,detail,before_data,after_data)
  values(p_actor_id,'update_user',p_user_id::text,before_row,result);
  return result;
end $$;

create or replace function public.record_user_password_reset(p_actor_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
declare app_role text; target_email text; result jsonb;
begin
  select p.role into app_role from public.profiles p where p.id=p_actor_id and p.active;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  select coalesce(p.email,lower(u.email)) into target_email
  from public.profiles p join auth.users u on u.id=p.id where p.id=p_user_id and p.active;
  if target_email is null then raise exception 'active user not found'; end if;
  result=jsonb_build_object('id',p_user_id,'email',target_email,'delivery','requested');
  insert into public.audit_logs(user_id,action,detail,after_data)
  values(p_actor_id,'reset_user_password',p_user_id::text,result);
  return result;
end $$;

revoke all on function public.consume_user_management_quota(uuid,text) from public,anon,authenticated;
revoke all on function public.complete_user_management_update(uuid,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.record_user_password_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.consume_user_management_quota(uuid,text) to service_role;
grant execute on function public.complete_user_management_update(uuid,uuid,text,text,boolean) to service_role;
grant execute on function public.record_user_password_reset(uuid,uuid) to service_role;

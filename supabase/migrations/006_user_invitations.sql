alter table public.profiles add column if not exists email text;

update public.profiles p
set email=lower(u.email)
from auth.users u
where u.id=p.id and p.email is null and u.email is not null;

alter table public.profiles drop constraint if exists profiles_email_valid;
alter table public.profiles add constraint profiles_email_valid check (
  email is null or (
    char_length(email) between 3 and 320
    and email=lower(email)
    and email !~ '[[:cntrl:]]'
  )
);
create unique index if not exists profiles_email_lower_unique on public.profiles(lower(email)) where email is not null;

create table if not exists public.user_invite_rate_limits (
  actor_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check(attempts between 0 and 5),
  updated_at timestamptz not null default now()
);
alter table public.user_invite_rate_limits enable row level security;
revoke all on table public.user_invite_rate_limits from public,anon,authenticated;

create or replace function public.consume_user_invite_quota(p_actor_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; quota public.user_invite_rate_limits%rowtype;
begin
  select p.role into app_role from public.profiles p where p.id=p_actor_id and p.active;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  insert into public.user_invite_rate_limits(actor_id,attempts) values(p_actor_id,0) on conflict(actor_id) do nothing;
  select * into quota from public.user_invite_rate_limits where actor_id=p_actor_id for update;
  if quota.window_started_at<=now()-interval '10 minutes' then
    update public.user_invite_rate_limits set window_started_at=now(),attempts=1,updated_at=now() where actor_id=p_actor_id;
    return true;
  end if;
  if quota.attempts>=5 then return false; end if;
  update public.user_invite_rate_limits set attempts=attempts+1,updated_at=now() where actor_id=p_actor_id;
  return true;
end $$;

create or replace function public.complete_user_invitation(
  p_actor_id uuid,
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_role text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare app_role text; normalized_email text; result jsonb;
begin
  select p.role into app_role from public.profiles p where p.id=p_actor_id and p.active;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  normalized_email=lower(trim(coalesce(p_email,'')));
  if p_user_id is null
    or p_role not in ('admin','scorer')
    or char_length(normalized_email) not between 3 and 320
    or normalized_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
    or char_length(trim(coalesce(p_display_name,''))) not between 1 and 100
    or p_display_name ~ '[[:cntrl:]]'
  then raise exception 'invalid invitation input'; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id and lower(u.email)=normalized_email) then
    raise exception 'auth user mismatch';
  end if;
  insert into public.profiles(id,email,display_name,role,active)
  values(p_user_id,normalized_email,trim(p_display_name),p_role,true)
  on conflict(id) do update set email=excluded.email,display_name=excluded.display_name,role=excluded.role,active=true;
  result=jsonb_build_object('id',p_user_id,'email',normalized_email,'display_name',trim(p_display_name),'role',p_role,'active',true,'invitation_status','invited');
  insert into public.audit_logs(user_id,action,detail,after_data)
  values(p_actor_id,'invite_user',p_role||':'||normalized_email,result);
  return result;
end $$;

create or replace function public.get_admin_users() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,auth,pg_temp as $$
declare app_role text; result jsonb;
begin
  select public.current_app_role() into app_role;
  if app_role is distinct from 'admin' then raise exception 'admin role required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'email',coalesce(p.email,lower(u.email)),
    'display_name',p.display_name,
    'role',p.role,
    'active',p.active,
    'invitation_status',case when u.last_sign_in_at is not null or u.confirmed_at is not null then 'active' else 'invited' end,
    'invited_at',u.invited_at,
    'last_sign_in_at',u.last_sign_in_at
  ) order by p.role,p.display_name,p.id),'[]'::jsonb) into result
  from public.profiles p join auth.users u on u.id=p.id;
  return result;
end $$;

revoke all on function public.consume_user_invite_quota(uuid) from public,anon,authenticated;
revoke all on function public.complete_user_invitation(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.get_admin_users() from public,anon;
grant execute on function public.consume_user_invite_quota(uuid) to service_role;
grant execute on function public.complete_user_invitation(uuid,uuid,text,text,text) to service_role;
grant execute on function public.get_admin_users() to authenticated;

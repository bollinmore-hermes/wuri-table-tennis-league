-- Read-only verification against the linked Test project. No user/roster mutation.
begin read only;
do $$
declare scorer_id uuid; dataset jsonb; public_data jsonb;
begin
  select id into scorer_id from public.profiles where role='scorer' and active=true limit 1;
  if scorer_id is null then raise exception 'active scorer fixture unavailable'; end if;
  perform set_config('request.jwt.claim.sub',scorer_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',scorer_id,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  if public.current_app_role() is distinct from 'scorer' then raise exception 'scorer context not established'; end if;
  dataset=public.get_admin_dataset('2026-autumn-second-half');
  if jsonb_array_length(dataset->'players')<>0 or jsonb_array_length(dataset->'audits')<>0 then raise exception 'private scorer data leak'; end if;
  public_data=public.get_public_league('2026-autumn-second-half');
  if jsonb_array_length(public_data->'roster')<>73 then raise exception 'unexpected public roster count'; end if;
  if has_table_privilege(current_user,'public.players','select') then raise exception 'direct table access allowed'; end if;
  begin
    perform public.import_team_rosters('2026-autumn-second-half','[]'::jsonb);
    raise exception 'scorer import unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role','anon',true);
  begin
    perform public.get_admin_dataset('2026-autumn-second-half');
    raise exception 'anonymous full roster unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'Verified Test SQL authorization: scorer full names=0, audits=0, public members=73; scorer import and anonymous management denied';
end $$;
rollback;

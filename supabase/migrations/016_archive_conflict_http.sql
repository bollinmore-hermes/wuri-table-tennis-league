-- A stale preview is a deterministic business conflict, not serialization failure.
-- PostgREST can retry SQLSTATE 40001 indefinitely; use HTTP-mapped PT409.
begin;
create or replace function public.reserve_season_archive(p_season_code text,p_options jsonb,p_expected_revision text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare existing public.season_archives; preview jsonb; sid uuid;
begin
 if public.current_app_role() is distinct from 'admin' then raise exception 'admin role required' using errcode='42501';end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision!~'^[a-f0-9]{64}$' then raise exception 'missing archive request identity';end if;
 perform pg_advisory_xact_lock(73491037);
 select * into existing from public.season_archives where season_code=p_season_code or id=p_request_id;
 if found then
  if existing.id<>p_request_id or existing.season_code<>p_season_code or existing.revision_hash<>p_expected_revision or existing.declarations<>p_options then raise exception 'archive request conflict' using errcode='PT409';end if;
  return jsonb_build_object('id',existing.id,'season_code',existing.season_code,'state',existing.state,'created_at',existing.created_at,'content_hash',existing.content_hash,'public_content',existing.public_content,'object_path',existing.object_path);
 end if;
 preview=public.preview_season_archive(p_season_code,p_options);
 if preview->>'revision_hash' is distinct from p_expected_revision then raise exception 'archive preview changed; recheck' using errcode='PT409';end if;
 if preview->>'eligible' is distinct from 'true' then raise exception 'archive eligibility failed';end if;
 select id into sid from public.seasons where code=p_season_code;
 insert into public.season_archives(id,season_id,season_code,actor_id,content_hash,revision_hash,public_content,current_projection,declarations) values(p_request_id,sid,p_season_code,auth.uid(),preview->>'content_hash',p_expected_revision,preview->'content',public.public_snapshot_dataset(p_season_code),p_options) returning * into existing;
 insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'season_archive_reserved',p_season_code,jsonb_build_object('archive_id',existing.id,'content_hash',existing.content_hash));
 return jsonb_build_object('id',existing.id,'season_code',existing.season_code,'state',existing.state,'created_at',existing.created_at,'content_hash',existing.content_hash,'public_content',existing.public_content,'object_path',existing.object_path);
end $$;
commit;

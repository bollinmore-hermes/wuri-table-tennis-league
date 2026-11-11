-- #37: immutable season archives. No existing season is closed by this migration.
begin;
create table public.season_archives (
 id uuid primary key, season_id uuid not null unique references public.seasons(id),
 -- Historical actor UUID is an immutable audit identity, not an Auth-deletion FK.
 season_code text not null unique, actor_id uuid not null,
 state text not null default 'pending' check(state in ('pending','published')),
 created_at timestamptz not null default date_trunc('milliseconds',clock_timestamp()),
 published_at timestamptz, content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 revision_hash text not null check(revision_hash~'^[a-f0-9]{64}$'),
 public_content jsonb not null, current_projection jsonb not null, declarations jsonb not null, object_path text
);
alter table public.season_archives enable row level security;
revoke all on public.season_archives from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('wuri-season-archives','wuri-season-archives',true,2000000,array['application/json']) on conflict(id) do nothing;

-- BEFORE STATEMENT executes before row locks of INSERT/UPDATE/DELETE. All
-- participating writes and archive reservations share the same transaction lock.
-- Archive functions do not lock live season/match rows, avoiding inversion with
-- existing review/link RPCs that select them FOR UPDATE before their first write.
create function public.archive_serialize_write() returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$ begin perform pg_advisory_xact_lock(73491037);return null;end $$;
create function public.archive_row_seasons(p_table text,p_row jsonb) returns uuid[]
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare ids uuid[];
begin
 if p_row is null then return '{}'::uuid[];end if;
 if p_table='seasons' then return array[(p_row->>'id')::uuid];
 elsif p_table in ('groups','season_teams','matches','standings_snapshots','daily_report_links') then return array[(p_row->>'season_id')::uuid];
 elsif p_table='players' then
  select coalesce(array_agg(s.id),'{}') into ids from public.seasons s where s.code=p_row->>'season_code' or ((p_row->>'season_code') is null and exists(select 1 from public.season_teams st where st.season_id=s.id and st.team_id=(p_row->>'team_id')::uuid));
 else select array[m.season_id] into ids from public.matches m where m.id=(p_row->>'match_id')::uuid;
 end if;return coalesce(ids,'{}');
end $$;
create function public.archive_guard_write() returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare ids uuid[];
begin
 -- Auth deletion may clear an attribution FK, but never alter frozen content.
 if TG_OP='UPDATE' and pg_trigger_depth()>1 and to_jsonb(old)?'updated_by' and to_jsonb(new)->'updated_by'='null'::jsonb and (to_jsonb(old)-'updated_by')=(to_jsonb(new)-'updated_by') then return new;end if;
 ids=public.archive_row_seasons(TG_TABLE_NAME,case when TG_OP='INSERT' then null else to_jsonb(old) end)||public.archive_row_seasons(TG_TABLE_NAME,case when TG_OP='DELETE' then null else to_jsonb(new) end);
 if exists(select 1 from public.season_archives a where a.season_id=any(ids)) then raise exception 'season is frozen by archive; use audited correction workflow' using errcode='55000';end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end $$;
do $$ declare t text;begin
 foreach t in array array['seasons','groups','season_teams','matches','match_results','standings_snapshots','players','daily_report_links','referee_reports','referee_report_requests','result_review_requests'] loop
  execute format('create trigger archive_write_serial before insert or update or delete on public.%I for each statement execute function public.archive_serialize_write()',t);
  execute format('create trigger archive_write_guard before insert or update or delete on public.%I for each row execute function public.archive_guard_write()',t);
 end loop;
 -- Team names are shared across seasons. Serialize their mutation for preview
 -- invalidation, but future-season renames are safe: archives copy display data.
 create trigger archive_write_serial before insert or update or delete on public.teams for each statement execute function public.archive_serialize_write();
end $$;
create function public.archive_immutable_record() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' or old.state='published' or (to_jsonb(old)-array['state','published_at','object_path']) is distinct from (to_jsonb(new)-array['state','published_at','object_path']) then raise exception 'archive immutable' using errcode='55000';end if;
 return new;
end $$;
create trigger archive_immutable before update or delete on public.season_archives for each row execute function public.archive_immutable_record();

-- Keep existing current-site snapshot readers intact after closure. They read the
-- frozen projection instead of mutable shared team names. Never deactivate a live
-- season or rewrite its scores merely to archive it.
alter function public.get_public_league(text) rename to archive_live_public_league;
revoke all on function public.archive_live_public_league(text) from public,anon,authenticated,service_role;
create function public.get_public_league(p_season_code text) returns jsonb language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
 select coalesce((select current_projection from public.season_archives where season_code=p_season_code),public.archive_live_public_league(p_season_code))
$$;
grant execute on function public.get_public_league(text) to anon,authenticated,service_role;

create function public.archive_source_revision(p_season_code text,p_options jsonb) returns text
language sql stable security definer set search_path=pg_catalog,public,extensions,pg_temp as $$
 with s as (select id from public.seasons where code=p_season_code), raw as (
 select jsonb_build_object('options',p_options,'season',(select to_jsonb(x) from public.seasons x where id=(select id from s)),
 'groups',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.groups x where season_id=(select id from s)),
 'memberships',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.season_teams x where season_id=(select id from s)),
 'teams',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.teams x where id in (select team_id from public.season_teams where season_id=(select id from s))),
 'matches',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.matches x where season_id=(select id from s)),
 'results',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.match_results x where match_id in(select id from public.matches where season_id=(select id from s))),
 'snapshots',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.standings_snapshots x where season_id=(select id from s)),
 'reports',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.referee_reports x where match_id in(select id from public.matches where season_id=(select id from s))),
 'players',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.players x where season_code=p_season_code or (season_code is null and team_id in(select team_id from public.season_teams where season_id=(select id from s))))) d)
 select encode(extensions.digest(convert_to(public.public_snapshot_canonical(d),'UTF8'),'sha256'),'hex') from raw
$$;

create function public.preview_season_archive(p_season_code text,p_options jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,extensions,pg_temp as $$
declare sid uuid; issue jsonb; blockers jsonb:='[]'; warnings jsonb:='[]'; d jsonb; c jsonb; n int; row jsonb; opts jsonb; ranks jsonb; exceptions jsonb; revision text; frozen public.season_archives;
begin
 if public.current_app_role() is distinct from 'admin' then raise exception 'admin role required' using errcode='42501';end if;
 if p_season_code is null or p_season_code!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then raise exception 'invalid season';end if;
 perform pg_advisory_xact_lock(73491037);
 select id into sid from public.seasons where code=p_season_code;
 if sid is null then raise exception 'unknown season';end if;
 select * into frozen from public.season_archives where season_id=sid;
 if found then return jsonb_build_object('eligible',false,'archive',jsonb_build_object('id',frozen.id,'state',frozen.state,'season_code',frozen.season_code),'blockers',jsonb_build_array(jsonb_build_object('code','already_frozen','message','本季已進入封存流程，請查詢封存狀態')),'warnings','[]'::jsonb);end if;
 if p_options is null or jsonb_typeof(p_options) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_options) k where k not in ('rules_text','rules_source','final_rankings','final_rankings_note','exceptions','all_stages_closed','results_confirmed','public_scope_confirmed')) then raise exception 'invalid archive options';end if;
 opts=p_options;ranks=opts->'final_rankings';exceptions=opts->'exceptions';
 if jsonb_typeof(ranks) is distinct from 'array' or jsonb_typeof(exceptions) is distinct from 'array' or jsonb_array_length(ranks)>100 or jsonb_array_length(exceptions)>500 then raise exception 'invalid archive arrays';end if;
 if jsonb_typeof(opts->'rules_text') is distinct from 'string' or length(btrim(opts->>'rules_text')) not between 0 and 12000 or jsonb_typeof(opts->'rules_source') is distinct from 'string' or length(opts->>'rules_source')>500 or jsonb_typeof(opts->'final_rankings_note') is distinct from 'string' or length(opts->>'final_rankings_note')>1000 then raise exception 'invalid archive text';end if;
 if length(btrim(opts->>'rules_text'))=0 then blockers=blockers||jsonb_build_array(jsonb_build_object('code','rules_required','message','請留存當季規則；未提供的條款請明確標示'));end if;
 foreach row in array array[jsonb_build_object('key','all_stages_closed','label','請核定所有階段包含季後賽均已結束'),jsonb_build_object('key','results_confirmed','label','請核定正式賽果與最終名次'),jsonb_build_object('key','public_scope_confirmed','label','請核定規則與公開範圍')] loop
  if opts->(row->>'key') is distinct from 'true'::jsonb then blockers=blockers||jsonb_build_array(jsonb_build_object('code',row->>'key','message',row->>'label'));end if;
 end loop;
 if not exists(select 1 from public.matches where season_id=sid) then blockers=blockers||jsonb_build_array(jsonb_build_object('code','empty_season','message','沒有賽事，不能封存'));end if;
 for issue in select jsonb_build_object('code','unresolved_match','match_code',match_code,'message','尚有未完賽或延期待處理賽事') from public.matches where season_id=sid and status not in ('final','cancelled') order by match_code loop blockers=blockers||jsonb_build_array(issue);end loop;
 for issue in select jsonb_build_object('code','invalid_result','match_code',m.match_code,'message','完賽結果缺漏、未公開，或取消賽事仍有比分') from public.matches m left join public.match_results r on r.match_id=m.id where m.season_id=sid and ((m.status='final' and (r.match_id is null or not r.published or not m.published or not ((r.home_score=3 and r.away_score=0) or (r.home_score=0 and r.away_score=3) or (r.home_score=2 and r.away_score=1) or (r.home_score=1 and r.away_score=2)))) or (m.status='cancelled' and r.match_id is not null)) loop blockers=blockers||jsonb_build_array(issue);end loop;
 for issue in select jsonb_build_object('code','pending_report','match_code',m.match_code,'message','尚有待審核的裁判回報') from public.referee_reports r join public.matches m on m.id=r.match_id where m.season_id=sid and r.disposition='pending' loop blockers=blockers||jsonb_build_array(issue);end loop;
 for issue in select jsonb_build_object('code','invalid_team_reference','match_code',m.match_code,'message','賽事球隊、分組或啟用狀態不一致') from public.matches m where m.season_id=sid and (not exists(select 1 from public.season_teams st join public.teams t on t.id=st.team_id join public.groups g on g.id=st.group_id where st.team_id=m.home_team_id and st.season_id=sid and st.group_id=m.group_id and g.season_id=sid and st.active and t.active) or not exists(select 1 from public.season_teams st join public.teams t on t.id=st.team_id join public.groups g on g.id=st.group_id where st.team_id=m.away_team_id and st.season_id=sid and st.group_id=m.group_id and g.season_id=sid and st.active and t.active)) loop blockers=blockers||jsonb_build_array(issue);end loop;
 if (select status from public.seasons where id=sid)<>'active' then blockers=blockers||jsonb_build_array(jsonb_build_object('code','inactive_season','message','僅能封存已初始化的啟用賽季'));end if;
 select count(*) into n from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.active and t.active;
 if jsonb_array_length(ranks)=0 then
  if length(btrim(opts->>'final_rankings_note'))<1 then blockers=blockers||jsonb_build_array(jsonb_build_object('code','final_rankings_required','message','請提供最終名次，或明確說明主辦未提供'));else warnings=warnings||jsonb_build_array(jsonb_build_object('code','no_final_rankings','message','最終名次未提供，公開頁不推算冠軍'));end if;
 elsif jsonb_array_length(ranks)<>n then blockers=blockers||jsonb_build_array(jsonb_build_object('code','incomplete_final_rankings','message','提供最終名次時須涵蓋所有啟用隊伍'));end if;
 if exists(select 1 from jsonb_array_elements(ranks) x where jsonb_typeof(x) is distinct from 'object' or (select count(*) from jsonb_object_keys(x))<>2 or not (x?'team_code' and x?'rank') or jsonb_typeof(x->'team_code') is distinct from 'string' or coalesce(x->>'rank','')!~'^[0-9]{1,3}$' or not exists(select 1 from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.active and t.active and t.team_code=x->>'team_code')) then raise exception 'invalid final rankings';end if;
 if exists(select 1 from jsonb_array_elements(ranks) x where jsonb_typeof(x->'rank') is distinct from 'number' or (x->>'rank')::int not between 1 and greatest(n,1)) or (select count(distinct x->>'team_code') from jsonb_array_elements(ranks) x)<>jsonb_array_length(ranks) or (select count(*) from jsonb_array_elements(ranks) x where x->>'rank'='1')>1 then raise exception 'invalid or duplicate final rankings';end if;
 if exists(select 1 from jsonb_array_elements(exceptions) x where jsonb_typeof(x) is distinct from 'object' or (select count(*) from jsonb_object_keys(x))<>2 or not(x?'match_code' and x?'reason') or jsonb_typeof(x->'reason') is distinct from 'string' or length(btrim(x->>'reason')) not between 1 and 500 or not exists(select 1 from public.matches m where m.season_id=sid and m.status='cancelled' and m.match_code=x->>'match_code')) or (select count(distinct x->>'match_code') from jsonb_array_elements(exceptions) x)<>jsonb_array_length(exceptions) then raise exception 'invalid exception explanations';end if;
 for issue in select jsonb_build_object('code','cancelled_reason_required','match_code',m.match_code,'message','取消賽事需提供正式處理說明') from public.matches m where m.season_id=sid and m.status='cancelled' and not exists(select 1 from jsonb_array_elements(exceptions) x where x->>'match_code'=m.match_code) loop blockers=blockers||jsonb_build_array(issue);end loop;
 d=public.public_snapshot_dataset(p_season_code);
 -- Archive no private roster, audit, referee tokens, result notes or actor IDs.
 d=jsonb_set(d,'{roster}','[]'::jsonb);
 c=jsonb_build_object('league',d,'rules',jsonb_build_object('text',opts->>'rules_text','source',opts->>'rules_source'),'final_rankings',ranks,'final_rankings_note',opts->>'final_rankings_note','exceptions',exceptions,'ranking_method','points-v1');
 if octet_length(c::text)>1800000 then blockers=blockers||jsonb_build_array(jsonb_build_object('code','archive_too_large','message','公開封存內容超過大小限制'));end if;
 revision=public.archive_source_revision(p_season_code,opts);
 return jsonb_build_object('eligible',jsonb_array_length(blockers)=0,'blockers',blockers,'warnings',warnings,'revision_hash',revision,'content',c,'content_hash',encode(extensions.digest(convert_to(public.public_snapshot_canonical(c),'UTF8'),'sha256'),'hex'));
end $$;

create function public.reserve_season_archive(p_season_code text,p_options jsonb,p_expected_revision text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare existing public.season_archives; preview jsonb; sid uuid;
begin
 if public.current_app_role() is distinct from 'admin' then raise exception 'admin role required' using errcode='42501';end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision!~'^[a-f0-9]{64}$' then raise exception 'missing archive request identity';end if;
 perform pg_advisory_xact_lock(73491037);
 select * into existing from public.season_archives where season_code=p_season_code or id=p_request_id;
 if found then
  if existing.id<>p_request_id or existing.season_code<>p_season_code or existing.revision_hash<>p_expected_revision or existing.declarations<>p_options then raise exception 'archive request conflict' using errcode='40001';end if;
  return jsonb_build_object('id',existing.id,'season_code',existing.season_code,'state',existing.state,'created_at',existing.created_at,'content_hash',existing.content_hash,'public_content',existing.public_content,'object_path',existing.object_path);
 end if;
 preview=public.preview_season_archive(p_season_code,p_options);
 if preview->>'revision_hash' is distinct from p_expected_revision then raise exception 'archive preview changed; recheck' using errcode='40001';end if;
 if preview->>'eligible' is distinct from 'true' then raise exception 'archive eligibility failed';end if;
 select id into sid from public.seasons where code=p_season_code;
 insert into public.season_archives(id,season_id,season_code,actor_id,content_hash,revision_hash,public_content,current_projection,declarations) values(p_request_id,sid,p_season_code,auth.uid(),preview->>'content_hash',p_expected_revision,preview->'content',public.public_snapshot_dataset(p_season_code),p_options) returning * into existing;
 insert into public.audit_logs(user_id,action,detail,after_data) values(auth.uid(),'season_archive_reserved',p_season_code,jsonb_build_object('archive_id',existing.id,'content_hash',existing.content_hash));
 return jsonb_build_object('id',existing.id,'season_code',existing.season_code,'state',existing.state,'created_at',existing.created_at,'content_hash',existing.content_hash,'public_content',existing.public_content,'object_path',existing.object_path);
end $$;
create function public.get_season_archive_status(p_season_code text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare a public.season_archives;
begin
 if public.current_app_role() is distinct from 'admin' then raise exception 'admin role required' using errcode='42501';end if;
 select * into a from public.season_archives where season_code=p_season_code;
 if not found then return jsonb_build_object('state','live');end if;
 return jsonb_build_object('id',a.id,'season_code',a.season_code,'state',a.state,'created_at',a.created_at,'content_hash',a.content_hash,'public_content',a.public_content,'object_path',a.object_path);
end $$;
create function public.confirm_season_archive(p_id uuid,p_hash text,p_object_path text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare a public.season_archives;
begin
 perform pg_advisory_xact_lock(73491037);
 select * into a from public.season_archives where id=p_id for update;
 if not found or a.content_hash is distinct from p_hash or p_object_path is distinct from (a.season_code||'/'||a.id||'-'||a.content_hash||'.json') then raise exception 'invalid archive confirmation';end if;
 if a.state='published' then return jsonb_build_object('id',a.id,'state',a.state);end if;
 update public.season_archives set state='published',published_at=clock_timestamp(),object_path=p_object_path where id=p_id;
 insert into public.audit_logs(user_id,action,detail,after_data) values((select id from auth.users where id=a.actor_id),'season_archive_published',a.season_code,jsonb_build_object('archive_id',a.id,'content_hash',a.content_hash));
 return jsonb_build_object('id',a.id,'state','published');
end $$;
create function public.get_public_season_archives(p_season_code text default null) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('archiveId',id,'seasonCode',season_code,'name',public_content#>>'{league,season,name}','archivedAt',created_at,'contentHash',content_hash,'objectPath',object_path,'teamCount',jsonb_array_length(public_content#>'{league,teams}'),'matchCount',jsonb_array_length(public_content#>'{league,matches}')) order by created_at desc),'[]'::jsonb) from public.season_archives where state='published' and (p_season_code is null or season_code=p_season_code)
$$;
create function public.list_archive_seasons() returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if public.current_app_role() is distinct from 'admin' then raise exception 'admin role required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('code',s.code,'name',s.name,'state',coalesce(a.state,'live')) order by s.created_at desc) from public.seasons s left join public.season_archives a on a.season_id=s.id where s.status='active' or a.id is not null),'[]'::jsonb);
end $$;
create function public.get_archive_season_context(p_season_code text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare sid uuid;
begin
 if public.current_app_role() is distinct from 'admin' then raise exception 'admin role required' using errcode='42501';end if;
 select id into sid from public.seasons where code=p_season_code;if sid is null then raise exception 'unknown season';end if;
 return jsonb_build_object('teams',coalesce((select jsonb_agg(jsonb_build_object('team_code',t.team_code,'name',coalesce(nullif(st.display_name,''),t.name)) order by t.team_code) from public.season_teams st join public.teams t on t.id=st.team_id where st.season_id=sid and st.active and t.active),'[]'::jsonb),'cancelled',coalesce((select jsonb_agg(jsonb_build_object('match_code',match_code) order by match_code) from public.matches where season_id=sid and status='cancelled'),'[]'::jsonb));
end $$;
revoke all on function public.get_archive_season_context(text) from public,anon,authenticated,service_role;
grant execute on function public.get_archive_season_context(text) to authenticated;
revoke all on function public.archive_serialize_write(),public.archive_row_seasons(text,jsonb),public.archive_guard_write(),public.archive_immutable_record(),public.archive_source_revision(text,jsonb),public.preview_season_archive(text,jsonb),public.reserve_season_archive(text,jsonb,text,uuid),public.get_season_archive_status(text),public.confirm_season_archive(uuid,text,text),public.get_public_season_archives(text),public.list_archive_seasons() from public,anon,authenticated,service_role;
grant execute on function public.preview_season_archive(text,jsonb),public.reserve_season_archive(text,jsonb,text,uuid),public.get_season_archive_status(text),public.list_archive_seasons() to authenticated;
grant execute on function public.confirm_season_archive(uuid,text,text),public.get_public_season_archives(text) to service_role;
commit;

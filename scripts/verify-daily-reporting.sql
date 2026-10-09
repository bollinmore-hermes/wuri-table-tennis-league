-- Real PostgreSQL verification. Every fixture/data mutation rolls back.
begin;
create function pg_temp.expect_rejected(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return;else raise;end if;end;
 raise exception 'expected rejection missing: %',expected;
end $$;
create function pg_temp.fail_issue53_audit() returns trigger language plpgsql as $$
begin
 if new.action='confirm_reported_result' and new.detail='I53-SQL-2' then raise exception 'intentional audit failure';end if;
 return new;
end $$;
create trigger issue53_verify_audit_failure before insert on public.audit_logs for each row execute function pg_temp.fail_issue53_audit();
do $$
#variable_conflict use_variable
declare admin_id uuid; scorer_id uuid; sid uuid; gid uuid; h uuid; a uuid; sid2 uuid; gid2 uuid; token text; renewed text; rid uuid; request uuid:=gen_random_uuid(); review_request uuid:=gen_random_uuid(); received jsonb; receipt jsonb; ver integer; baseline text;
begin
 select id into admin_id from public.profiles where role='admin' and active limit 1;
 select id into scorer_id from public.profiles where role='scorer' and active limit 1;
 if admin_id is null or scorer_id is null then raise exception 'Test identities unavailable';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 select md5(public.get_public_league('2026-autumn-second-half')::text) into baseline;
 insert into public.seasons(code,name,status) values('issue-53-sql-test','Issue 53 transaction-only fixture','inactive') returning id into sid;
 insert into public.groups(season_id,code,name) values(sid,'A','Test A') returning id into gid;
 select id into h from public.teams order by team_code limit 1;select id into a from public.teams where id<>h order by team_code limit 1;
 insert into public.matches(season_id,group_id,match_code,match_date,match_time,home_team_id,away_team_id,published) values
 (sid,gid,'I53-SQL-1','2099-01-01','15:30',h,a,false),(sid,gid,'I53-SQL-2','2099-01-01','16:00',h,a,false),(sid,gid,'I53-SQL-OTHER-DAY','2099-01-02','15:30',h,a,false);
 insert into public.seasons(code,name,status) values('issue-53-sql-other','Other season fixture','inactive') returning id into sid2;
 insert into public.groups(season_id,code,name) values(sid2,'A','Other A') returning id into gid2;
 insert into public.matches(season_id,group_id,match_code,match_date,match_time,home_team_id,away_team_id,published) values(sid2,gid2,'I53-SQL-OTHER-SEASON','2099-01-01','15:30',h,a,false);
 token:=public.manage_daily_report_link('issue-53-sql-test','2099-01-01','create')->>'token';
 if token is null or token<>(public.manage_daily_report_link('issue-53-sql-test','2099-01-01','create')->>'token') then raise exception 'token changed on repeat create';end if;
 if jsonb_array_length(public.get_daily_report_schedule(token)->'matches')<>2 then raise exception 'daily scope mismatch';end if;
 perform pg_temp.expect_rejected(format('select public.submit_referee_report(%L,%L,%L,3,0)',token,'I53-SQL-OTHER-DAY',request),'match outside daily link');
 perform pg_temp.expect_rejected(format('select public.submit_referee_report(%L,%L,%L,3,0)',token,'I53-SQL-OTHER-SEASON',request),'match outside daily link');
 perform pg_temp.expect_rejected(format('select public.get_referee_report_status(%L,%L,%L)',token,'I53-SQL-OTHER-DAY',request),'match outside daily link');
 perform pg_temp.expect_rejected(format('select public.submit_referee_report(%L,%L,%L,null,3)',token,'I53-SQL-1',request),'invalid report input');
 perform pg_temp.expect_rejected(format('select public.submit_referee_report(%L,%L,%L,3,1)',token,'I53-SQL-1',request),'invalid report input');
 received:=public.submit_referee_report(token,'I53-SQL-1',request,3,0);
 if received<>public.submit_referee_report(token,'I53-SQL-1',request,3,0) then raise exception 'idempotent request changed';end if;
 perform public.submit_referee_report(token,'I53-SQL-1',gen_random_uuid(),3,0);
 if (select count(*) from public.referee_reports where match_id=(select id from public.matches where match_code='I53-SQL-1'))<>1 then raise exception 'duplicate report';end if;
 perform public.submit_referee_report(token,'I53-SQL-1',gen_random_uuid(),2,1);
 if jsonb_array_length(public.get_result_review_queue('issue-53-sql-test'))<>2 then raise exception 'conflict lost';end if;
 if exists(select 1 from public.match_results r join public.matches m on m.id=r.match_id where m.season_id=sid) or baseline<>md5(public.get_public_league('2026-autumn-second-half')::text) then raise exception 'report mutated official/public data';end if;
 perform pg_temp.expect_rejected(format('select public.submit_referee_report(%L,%L,%L,2,1)',token,'I53-SQL-2',request),'request identity conflict');
 if public.get_referee_report_status(token,'I53-SQL-1',request)->>'status'<>'received' then raise exception 'receipt missing';end if;
 update public.daily_report_links set submissions=120 where daily_report_links.token=token;
 perform pg_temp.expect_rejected(format('select public.submit_referee_report(%L,%L,%L,3,0)',token,'I53-SQL-2',gen_random_uuid()),'rate limited');
 update public.daily_report_links set submissions=0 where daily_report_links.token=token;
 select id into rid from public.referee_reports where home_score=3 and match_id=(select id from public.matches where match_code='I53-SQL-1');
 perform pg_temp.expect_rejected(format('select public.confirm_reported_result(%L,%L,%L,%L,2,1,%L,0)','issue-53-sql-test','I53-SQL-1',review_request,rid,''),'source mismatch');
 receipt:=public.confirm_reported_result('issue-53-sql-test','I53-SQL-1',review_request,rid,3,0,'paper checked',0);
 if receipt<>public.confirm_reported_result('issue-53-sql-test','I53-SQL-1',review_request,rid,3,0,'paper checked',0) then raise exception 'review request not idempotent';end if;
 if public.get_result_review_status('issue-53-sql-test','I53-SQL-1',review_request)->'receipt'<>receipt then raise exception 'review readback mismatch';end if;
 if exists(select 1 from public.referee_reports r join public.matches m on m.id=r.match_id where m.match_code='I53-SQL-1' and r.disposition='pending') then raise exception 'review disposition not atomic';end if;
 if not exists(select 1 from public.audit_logs where action='confirm_reported_result' and detail='I53-SQL-1' and user_id=admin_id) then raise exception 'audit missing';end if;
 perform pg_temp.expect_rejected(format('select public.submit_referee_report(%L,%L,%L,2,1)',token,'I53-SQL-1',gen_random_uuid()),'reporting closed');
 perform public.submit_referee_report(token,'I53-SQL-2',gen_random_uuid(),3,0);
 perform pg_temp.expect_rejected(format('select public.confirm_reported_result(%L,%L,%L,null,3,0,%L,0)','issue-53-sql-test','I53-SQL-2',gen_random_uuid(),''),'intentional audit failure');
 if exists(select 1 from public.match_results r join public.matches m on m.id=r.match_id where m.match_code='I53-SQL-2') or
 exists(select 1 from public.result_review_requests r join public.matches m on m.id=r.match_id where m.match_code='I53-SQL-2') or
 exists(select 1 from public.referee_reports r join public.matches m on m.id=r.match_id where m.match_code='I53-SQL-2' and r.disposition<>'pending') then raise exception 'failed audit did not roll back official result/review dispositions/request';end if;
 perform set_config('request.jwt.claim.sub',scorer_id::text,true);
 perform pg_temp.expect_rejected('select public.manage_daily_report_link(''issue-53-sql-test'',''2099-01-01'',''create'')','admin role required');
 ver:=(receipt->>'version')::integer;
 receipt:=public.confirm_reported_result('issue-53-sql-test','I53-SQL-1',gen_random_uuid(),null,2,1,'other staff correction',ver);
 if not exists(select 1 from public.match_results r join public.matches m on m.id=r.match_id where m.match_code='I53-SQL-1' and r.updated_by=scorer_id and r.home_score=2) then raise exception 'scorer correction failed';end if;
 perform pg_temp.expect_rejected(format('select public.confirm_reported_result(%L,%L,%L,null,1,2,%L,0)','issue-53-sql-test','I53-SQL-1',gen_random_uuid(),''),'version conflict');
 perform set_config('request.jwt.claim.sub',admin_id::text,true);ver:=(receipt->>'version')::integer;
 receipt:=public.lock_match_result('I53-SQL-1',ver,false);ver:=(receipt->>'version')::integer;
 perform set_config('request.jwt.claim.sub',scorer_id::text,true);
 perform pg_temp.expect_rejected(format('select public.confirm_reported_result(%L,%L,%L,null,1,2,%L,%s)','issue-53-sql-test','I53-SQL-1',gen_random_uuid(),'',ver),'result locked');
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 receipt:=public.confirm_reported_result('issue-53-sql-test','I53-SQL-1',gen_random_uuid(),null,1,2,'admin locked correction',ver);
 if not (receipt->>'locked')::boolean then raise exception 'admin correction lost result lock';end if;
 renewed:=public.manage_daily_report_link('issue-53-sql-test','2099-01-01','rotate')->>'token';if renewed=token then raise exception 'rotation unchanged';end if;
 perform pg_temp.expect_rejected(format('select public.get_daily_report_schedule(%L)',token),'invalid or revoked link');
 perform public.manage_daily_report_link('issue-53-sql-test','2099-01-01','revoke');
 perform pg_temp.expect_rejected(format('select public.get_daily_report_schedule(%L)',renewed),'invalid or revoked link');
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 perform pg_temp.expect_rejected('select public.get_result_review_queue(''issue-53-sql-test'')','permission denied');
 perform pg_temp.expect_rejected(format('select public.confirm_reported_result(%L,%L,%L,null,3,0,%L,0)','issue-53-sql-test','I53-SQL-2',gen_random_uuid(),''),'permission denied');
 if has_table_privilege('anon','public.referee_reports','SELECT') or has_table_privilege('authenticated','public.daily_report_links','SELECT') or has_function_privilege('anon','public.confirm_reported_result(text,text,uuid,uuid,integer,integer,text,integer)','EXECUTE') then raise exception 'browser privilege leaked';end if;
 if not has_function_privilege('anon','public.submit_referee_report(text,text,uuid,integer,integer)','EXECUTE') then raise exception 'report boundary absent';end if;
end $$;
rollback;
select true as ok,'scoped reports, dedup/conflict, quota, request receipts, atomic confirmation/audit, scorer correction, lock, rotation and denial verified; all fixtures rolled back' as verification;

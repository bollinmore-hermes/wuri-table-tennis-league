insert into public.seasons(code,name,status,start_date,end_date)
values('2026-autumn-second-half','2026 烏日桌球聯賽（下半季）','active','2026-08-23','2026-12-06')
on conflict(code) do update set name=excluded.name,status=excluded.status,start_date=excluded.start_date,end_date=excluded.end_date;

insert into public.groups(season_id,code,name,display_order)
select s.id,v.code,v.name,v.ord from public.seasons s cross join (values('A','A 組',1),('B','B 組',2)) v(code,name,ord)
where s.code='2026-autumn-second-half'
on conflict(season_id,code) do update set name=excluded.name,display_order=excluded.display_order;

-- Reviewed one-off recovery of original full pregame bundles, not new captures.
-- Source values and original fetch times were backed up before recovery.
-- Fail closed if any of the 36 reviewed original cache entries changed.
begin;
set local statement_timeout='45s';
do $check$
declare n integer;
begin
with expected(key, fetched_at, game_id, tipoff_at) as (values
('board:v7:21717861:2026-10-21','2026-10-22 03:50:38.455578+00'::timestamptz,21717861::bigint,'2026-10-23 01:30:00+00'::timestamptz),
('board:v7:21717859:2026-10-20','2026-10-21 03:55:13.470892+00'::timestamptz,21717859::bigint,'2026-10-22 02:00:00+00'::timestamptz),
('board:v7:21717858:2026-10-20','2026-10-21 03:48:39.787426+00'::timestamptz,21717858::bigint,'2026-10-21 23:30:00+00'::timestamptz),
('board:v7:21717860:2026-10-21','2026-10-22 03:58:38.050145+00'::timestamptz,21717860::bigint,'2026-10-22 23:00:00+00'::timestamptz),
('board:v7:21717922:2026-10-20','2026-10-21 03:55:46.818331+00'::timestamptz,21717922::bigint,'2026-10-21 23:00:00+00'::timestamptz),
('board:v7:21717863:2026-10-22','2026-10-23 03:55:55.318826+00'::timestamptz,21717863::bigint,'2026-10-24 01:30:00+00'::timestamptz),
('board:v7:21717862:2026-10-22','2026-10-23 03:50:57.288435+00'::timestamptz,21717862::bigint,'2026-10-23 23:00:00+00'::timestamptz),
('board:v7:21717923:2026-10-20','2026-10-21 03:47:33.131515+00'::timestamptz,21717923::bigint,'2026-10-21 23:00:00+00'::timestamptz),
('board:v7:21717927:2026-10-20','2026-10-21 03:50:23.401689+00'::timestamptz,21717927::bigint,'2026-10-22 00:00:00+00'::timestamptz),
('board:v7:21717924:2026-10-20','2026-10-21 03:48:40.20828+00'::timestamptz,21717924::bigint,'2026-10-21 23:30:00+00'::timestamptz),
('board:v7:21717928:2026-10-20','2026-10-21 03:50:35.85787+00'::timestamptz,21717928::bigint,'2026-10-22 00:00:00+00'::timestamptz),
('board:v7:21717926:2026-10-20','2026-10-21 03:50:11.287758+00'::timestamptz,21717926::bigint,'2026-10-21 23:30:00+00'::timestamptz),
('board:v7:21717929:2026-10-20','2026-10-21 03:50:52.802193+00'::timestamptz,21717929::bigint,'2026-10-22 00:30:00+00'::timestamptz),
('board:v7:21717936:2026-10-22','2026-10-23 03:51:10.735597+00'::timestamptz,21717936::bigint,'2026-10-23 23:00:00+00'::timestamptz),
('board:v7:21717931:2026-10-20','2026-10-21 03:56:06.72482+00'::timestamptz,21717931::bigint,'2026-10-22 02:30:00+00'::timestamptz),
('board:v7:21717930:2026-10-20','2026-10-21 03:55:32.11963+00'::timestamptz,21717930::bigint,'2026-10-22 02:00:00+00'::timestamptz),
('board:v7:21717938:2026-10-22','2026-10-23 03:55:18.682045+00'::timestamptz,21717938::bigint,'2026-10-23 23:00:00+00'::timestamptz),
('board:v7:21717939:2026-10-22','2026-10-23 03:55:27.263737+00'::timestamptz,21717939::bigint,'2026-10-23 23:00:00+00'::timestamptz),
('board:v7:21717937:2026-10-22','2026-10-23 03:55:15.239819+00'::timestamptz,21717937::bigint,'2026-10-23 23:00:00+00'::timestamptz),
('board:v7:21717940:2026-10-22','2026-10-23 03:55:48.592854+00'::timestamptz,21717940::bigint,'2026-10-24 00:00:00+00'::timestamptz),
('board:v7:21717943:2026-10-22','2026-10-23 03:55:29.595971+00'::timestamptz,21717943::bigint,'2026-10-24 02:00:00+00'::timestamptz),
('board:v7:21717944:2026-10-22','2026-10-23 03:55:31.828409+00'::timestamptz,21717944::bigint,'2026-10-24 02:00:00+00'::timestamptz),
('board:v7:21717942:2026-10-22','2026-10-23 03:56:05.572802+00'::timestamptz,21717942::bigint,'2026-10-24 01:30:00+00'::timestamptz),
('board:v7:21717941:2026-10-22','2026-10-23 03:55:40.962589+00'::timestamptz,21717941::bigint,'2026-10-23 20:00:00+00'::timestamptz),
('board:v7:21717945:2026-10-22','2026-10-23 03:55:35.659282+00'::timestamptz,21717945::bigint,'2026-10-24 02:00:00+00'::timestamptz),
('board:v7:21717947:2026-10-23','2026-10-24 03:55:21.200801+00'::timestamptz,21717947::bigint,'2026-10-24 23:30:00+00'::timestamptz),
('board:v7:21717946:2026-10-23','2026-10-24 03:55:17.070537+00'::timestamptz,21717946::bigint,'2026-10-24 22:00:00+00'::timestamptz),
('board:v7:21717948:2026-10-23','2026-10-24 03:55:38.8633+00'::timestamptz,21717948::bigint,'2026-10-24 23:30:00+00'::timestamptz),
('board:v7:21717949:2026-10-23','2026-10-24 03:55:45.41819+00'::timestamptz,21717949::bigint,'2026-10-25 00:30:00+00'::timestamptz),
('board:v7:21717950:2026-10-23','2026-10-24 03:55:41.004953+00'::timestamptz,21717950::bigint,'2026-10-25 00:00:00+00'::timestamptz),
('board:v7:21717951:2026-10-23','2026-10-24 03:55:42.963756+00'::timestamptz,21717951::bigint,'2026-10-25 00:00:00+00'::timestamptz),
('board:v7:21717953:2026-10-23','2026-10-24 03:55:47.203678+00'::timestamptz,21717953::bigint,'2026-10-25 01:00:00+00'::timestamptz),
('board:v7:21717954:2026-10-23','2026-10-24 03:55:14.621033+00'::timestamptz,21717954::bigint,'2026-10-25 02:00:00+00'::timestamptz),
('board:v6:21717856:2026-10-20','2026-10-20 15:57:43.726222+00'::timestamptz,21717856::bigint,'2026-10-20 23:00:00+00'::timestamptz),
('board:v6:21717857:2026-10-20','2026-10-20 15:58:09.415182+00'::timestamptz,21717857::bigint,'2026-10-21 01:30:00+00'::timestamptz),
('board:v6:21717855:2026-10-20','2026-10-20 15:55:06.001419+00'::timestamptz,21717855::bigint,'2026-10-20T19:00:00.000Z'::timestamptz)
), candidates as materialized (
select c.key,c.payload,c.fetched_at,e.game_id,
 (c.payload#>>'{game,date}')::date game_date, (c.payload#>>'{game,home_team,id}')::bigint home_id, (c.payload#>>'{game,visitor_team,id}')::bigint visitor_id,
 least(e.tipoff_at,g.tipoff_at,(c.payload#>>'{game,datetime}')::timestamptz) tipoff_at
from expected e join public.nba_source_cache c on c.key=e.key and c.fetched_at=e.fetched_at
left join public.nba_odds_phase_games g on g.game_id=e.game_id
where (c.payload#>>'{game,id}')::bigint=e.game_id
 and c.payload->>'historical'='false'
 and c.payload->>'statsComplete'='true' and c.payload->>'periodStatsComplete'='true'
 and c.payload->'issues'='[]'::jsonb
 and jsonb_array_length(c.payload->'players')>0
), eligible as (
select * from candidates
where fetched_at<tipoff_at and (payload->>'fetchedAt')::timestamptz<=fetched_at and tipoff_at<clock_timestamp()
 and not exists(select 1 from jsonb_array_elements(payload->'players') p
 where (p#>>'{team,id}')::bigint not in(home_id,visitor_id))
 and not exists(select 1 from jsonb_array_elements(payload->'players') p
 cross join lateral jsonb_array_elements(coalesce(p->'logs','[]'::jsonb)||coalesce(p->'periodLogs','[]'::jsonb)) l
 where (l#>>'{game,id}')::bigint=game_id or (l#>>'{game,date}')::date >= game_date
 or (l#>>'{player,id}')::bigint<>(p->>'id')::bigint)
)
select count(*) into n from eligible;
if n<>36 then raise exception 'Recovery originals changed: expected36 got%',n; end if;
end $check$;
with expected(key, fetched_at, game_id, tipoff_at) as (values
('board:v7:21717861:2026-10-21','2026-10-22 03:50:38.455578+00'::timestamptz,21717861::bigint,'2026-10-23 01:30:00+00'::timestamptz),
('board:v7:21717859:2026-10-20','2026-10-21 03:55:13.470892+00'::timestamptz,21717859::bigint,'2026-10-22 02:00:00+00'::timestamptz),
('board:v7:21717858:2026-10-20','2026-10-21 03:48:39.787426+00'::timestamptz,21717858::bigint,'2026-10-21 23:30:00+00'::timestamptz),
('board:v7:21717860:2026-10-21','2026-10-22 03:58:38.050145+00'::timestamptz,21717860::bigint,'2026-10-22 23:00:00+00'::timestamptz),
('board:v7:21717922:2026-10-20','2026-10-21 03:55:46.818331+00'::timestamptz,21717922::bigint,'2026-10-21 23:00:00+00'::timestamptz),
('board:v7:21717863:2026-10-22','2026-10-23 03:55:55.318826+00'::timestamptz,21717863::bigint,'2026-10-24 01:30:00+00'::timestamptz),
('board:v7:21717862:2026-10-22','2026-10-23 03:50:57.288435+00'::timestamptz,21717862::bigint,'2026-10-23 23:00:00+00'::timestamptz),
('board:v7:21717923:2026-10-20','2026-10-21 03:47:33.131515+00'::timestamptz,21717923::bigint,'2026-10-21 23:00:00+00'::timestamptz),
('board:v7:21717927:2026-10-20','2026-10-21 03:50:23.401689+00'::timestamptz,21717927::bigint,'2026-10-22 00:00:00+00'::timestamptz),
('board:v7:21717924:2026-10-20','2026-10-21 03:48:40.20828+00'::timestamptz,21717924::bigint,'2026-10-21 23:30:00+00'::timestamptz),
('board:v7:21717928:2026-10-20','2026-10-21 03:50:35.85787+00'::timestamptz,21717928::bigint,'2026-10-22 00:00:00+00'::timestamptz),
('board:v7:21717926:2026-10-20','2026-10-21 03:50:11.287758+00'::timestamptz,21717926::bigint,'2026-10-21 23:30:00+00'::timestamptz),
('board:v7:21717929:2026-10-20','2026-10-21 03:50:52.802193+00'::timestamptz,21717929::bigint,'2026-10-22 00:30:00+00'::timestamptz),
('board:v7:21717936:2026-10-22','2026-10-23 03:51:10.735597+00'::timestamptz,21717936::bigint,'2026-10-23 23:00:00+00'::timestamptz),
('board:v7:21717931:2026-10-20','2026-10-21 03:56:06.72482+00'::timestamptz,21717931::bigint,'2026-10-22 02:30:00+00'::timestamptz),
('board:v7:21717930:2026-10-20','2026-10-21 03:55:32.11963+00'::timestamptz,21717930::bigint,'2026-10-22 02:00:00+00'::timestamptz),
('board:v7:21717938:2026-10-22','2026-10-23 03:55:18.682045+00'::timestamptz,21717938::bigint,'2026-10-23 23:00:00+00'::timestamptz),
('board:v7:21717939:2026-10-22','2026-10-23 03:55:27.263737+00'::timestamptz,21717939::bigint,'2026-10-23 23:00:00+00'::timestamptz),
('board:v7:21717937:2026-10-22','2026-10-23 03:55:15.239819+00'::timestamptz,21717937::bigint,'2026-10-23 23:00:00+00'::timestamptz),
('board:v7:21717940:2026-10-22','2026-10-23 03:55:48.592854+00'::timestamptz,21717940::bigint,'2026-10-24 00:00:00+00'::timestamptz),
('board:v7:21717943:2026-10-22','2026-10-23 03:55:29.595971+00'::timestamptz,21717943::bigint,'2026-10-24 02:00:00+00'::timestamptz),
('board:v7:21717944:2026-10-22','2026-10-23 03:55:31.828409+00'::timestamptz,21717944::bigint,'2026-10-24 02:00:00+00'::timestamptz),
('board:v7:21717942:2026-10-22','2026-10-23 03:56:05.572802+00'::timestamptz,21717942::bigint,'2026-10-24 01:30:00+00'::timestamptz),
('board:v7:21717941:2026-10-22','2026-10-23 03:55:40.962589+00'::timestamptz,21717941::bigint,'2026-10-23 20:00:00+00'::timestamptz),
('board:v7:21717945:2026-10-22','2026-10-23 03:55:35.659282+00'::timestamptz,21717945::bigint,'2026-10-24 02:00:00+00'::timestamptz),
('board:v7:21717947:2026-10-23','2026-10-24 03:55:21.200801+00'::timestamptz,21717947::bigint,'2026-10-24 23:30:00+00'::timestamptz),
('board:v7:21717946:2026-10-23','2026-10-24 03:55:17.070537+00'::timestamptz,21717946::bigint,'2026-10-24 22:00:00+00'::timestamptz),
('board:v7:21717948:2026-10-23','2026-10-24 03:55:38.8633+00'::timestamptz,21717948::bigint,'2026-10-24 23:30:00+00'::timestamptz),
('board:v7:21717949:2026-10-23','2026-10-24 03:55:45.41819+00'::timestamptz,21717949::bigint,'2026-10-25 00:30:00+00'::timestamptz),
('board:v7:21717950:2026-10-23','2026-10-24 03:55:41.004953+00'::timestamptz,21717950::bigint,'2026-10-25 00:00:00+00'::timestamptz),
('board:v7:21717951:2026-10-23','2026-10-24 03:55:42.963756+00'::timestamptz,21717951::bigint,'2026-10-25 00:00:00+00'::timestamptz),
('board:v7:21717953:2026-10-23','2026-10-24 03:55:47.203678+00'::timestamptz,21717953::bigint,'2026-10-25 01:00:00+00'::timestamptz),
('board:v7:21717954:2026-10-23','2026-10-24 03:55:14.621033+00'::timestamptz,21717954::bigint,'2026-10-25 02:00:00+00'::timestamptz),
('board:v6:21717856:2026-10-20','2026-10-20 15:57:43.726222+00'::timestamptz,21717856::bigint,'2026-10-20 23:00:00+00'::timestamptz),
('board:v6:21717857:2026-10-20','2026-10-20 15:58:09.415182+00'::timestamptz,21717857::bigint,'2026-10-21 01:30:00+00'::timestamptz),
('board:v6:21717855:2026-10-20','2026-10-20 15:55:06.001419+00'::timestamptz,21717855::bigint,'2026-10-20T19:00:00.000Z'::timestamptz)
), candidates as materialized (
select c.key,c.payload,c.fetched_at,e.game_id,
 (c.payload#>>'{game,date}')::date game_date, (c.payload#>>'{game,home_team,id}')::bigint home_id, (c.payload#>>'{game,visitor_team,id}')::bigint visitor_id,
 least(e.tipoff_at,g.tipoff_at,(c.payload#>>'{game,datetime}')::timestamptz) tipoff_at
from expected e join public.nba_source_cache c on c.key=e.key and c.fetched_at=e.fetched_at
left join public.nba_odds_phase_games g on g.game_id=e.game_id
where (c.payload#>>'{game,id}')::bigint=e.game_id
 and c.payload->>'historical'='false'
 and c.payload->>'statsComplete'='true' and c.payload->>'periodStatsComplete'='true'
 and c.payload->'issues'='[]'::jsonb
 and jsonb_array_length(c.payload->'players')>0
), eligible as (
select * from candidates
where fetched_at<tipoff_at and (payload->>'fetchedAt')::timestamptz<=fetched_at and tipoff_at<clock_timestamp()
 and not exists(select 1 from jsonb_array_elements(payload->'players') p
 where (p#>>'{team,id}')::bigint not in(home_id,visitor_id))
 and not exists(select 1 from jsonb_array_elements(payload->'players') p
 cross join lateral jsonb_array_elements(coalesce(p->'logs','[]'::jsonb)||coalesce(p->'periodLogs','[]'::jsonb)) l
 where (l#>>'{game,id}')::bigint=game_id or (l#>>'{game,date}')::date >= game_date
 or (l#>>'{player,id}')::bigint<>(p->>'id')::bigint)
)
insert into public.nba_pregame_research(game_id,resource,version,tipoff_at,observed_at,source,source_key,payload)
select game_id,'board:v1',1,tipoff_at,fetched_at,'recovered-cache',key,payload from eligible
on conflict(game_id,resource,version) do nothing;
select resource,count(*) rows,min(observed_at) oldest,max(observed_at) newest
from public.nba_pregame_research where resource='board:v1' and source='recovered-cache' group by resource;
commit;

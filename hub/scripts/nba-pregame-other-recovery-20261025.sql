-- PREPARED ONLY. Review the companion read-only preflight before applying.
-- Requires the research schema and root's original board recovery first.
-- Source is public.nba_source_cache (there is no public.nba_cache table).
-- Preserves original source timestamps and caches. No provider fetch or recalculation.
-- Inserts only absent resources; never overwrites existing captures/recovery.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
with expected(source_key,source_observed_at) as (values
  ('first-basket-research:v2:21717856','2026-10-20 22:13:39.516768+00'::timestamptz),
  ('first-basket-research:v2:21717857','2026-10-20 20:29:08.811609+00'::timestamptz),
  ('first-basket-research:v3:pregame:21717858','2026-10-21 23:29:10.813945+00'::timestamptz),
  ('first-basket-research:v3:pregame:21717859','2026-10-22 01:55:30.915069+00'::timestamptz),
  ('scouting:v1:21717856:2026-10-20','2026-10-20 22:55:29.46587+00'::timestamptz),
  ('scouting:v1:21717857:2026-10-20','2026-10-21 01:25:54.159752+00'::timestamptz),
  ('scouting:v1:21717858:2026-10-21','2026-10-21 23:13:10.52677+00'::timestamptz),
  ('scouting:v1:21717859:2026-10-21','2026-10-22 01:01:37.948996+00'::timestamptz),
  ('tracking:v1:21717856:2026-10-19','2026-10-20 03:00:54.195836+00'::timestamptz),
  ('tracking:v1:21717858:2026-10-20','2026-10-20 17:45:27.440756+00'::timestamptz),
  ('first-basket-research:v2:21717929','2026-10-20 14:03:54.794611+00'::timestamptz),
  ('first-basket-research:v3:pregame:21717928','2026-10-21 23:43:06.412223+00'::timestamptz),
  ('first-basket-research:v3:pregame:21717930','2026-10-22 00:32:41.770737+00'::timestamptz),
  ('scouting:v1:21717929:2026-10-21','2026-10-21 20:15:51.826586+00'::timestamptz),
  ('scouting:v1:21717930:2026-10-21','2026-10-21 16:29:45.772738+00'::timestamptz),
  ('scouting:v1:21717931:2026-10-21','2026-10-22 01:49:06.371989+00'::timestamptz),
  ('tracking:v1:21717928:2026-10-21','2026-10-21 23:38:52.34293+00'::timestamptz),
  ('tracking:v1:21717929:2026-10-21','2026-10-21 21:14:58.790068+00'::timestamptz),
  ('tracking:v1:21717930:2026-10-21','2026-10-22 01:47:14.516023+00'::timestamptz),
  ('tracking:v1:21717931:2026-10-21','2026-10-22 01:20:11.222487+00'::timestamptz),
  ('first-basket-research:v3:pregame:21717939','2026-10-23 19:02:32.221441+00'::timestamptz),
  ('scouting:v1:21717936:2026-10-23','2026-10-23 12:45:45.11792+00'::timestamptz),
  ('scouting:v1:21717937:2026-10-23','2026-10-23 12:44:16.905507+00'::timestamptz),
  ('scouting:v1:21717938:2026-10-23','2026-10-23 12:47:02.710536+00'::timestamptz),
  ('scouting:v1:21717939:2026-10-23','2026-10-23 12:47:41.781037+00'::timestamptz),
  ('scouting:v1:21717940:2026-10-23','2026-10-23 12:48:07.959095+00'::timestamptz),
  ('tracking:v1:21717936:2026-10-23','2026-10-23 22:05:25.997036+00'::timestamptz),
  ('tracking:v1:21717937:2026-10-20','2026-10-20 17:46:19.037407+00'::timestamptz),
  ('tracking:v1:21717938:2026-10-23','2026-10-23 22:09:40.504544+00'::timestamptz),
  ('tracking:v1:21717939:2026-10-23','2026-10-23 18:00:03.310418+00'::timestamptz),
  ('first-basket-research:v3:pregame:21717943','2026-10-23 23:37:03.552268+00'::timestamptz),
  ('first-basket-research:v3:pregame:21717944','2026-10-23 23:36:53.803891+00'::timestamptz),
  ('scouting:v1:21717941:2026-10-23','2026-10-23 19:40:31.888252+00'::timestamptz),
  ('scouting:v1:21717942:2026-10-23','2026-10-23 12:49:33.482345+00'::timestamptz),
  ('scouting:v1:21717943:2026-10-23','2026-10-23 12:50:13.951674+00'::timestamptz),
  ('scouting:v1:21717944:2026-10-23','2026-10-23 12:50:40.778076+00'::timestamptz),
  ('tracking:v1:21717940:2026-10-23','2026-10-23 22:17:01.589911+00'::timestamptz),
  ('tracking:v1:21717941:2026-10-22','2026-10-22 11:45:05.093702+00'::timestamptz),
  ('tracking:v1:21717942:2026-10-23','2026-10-23 18:07:33.783043+00'::timestamptz),
  ('tracking:v1:21717943:2026-10-23','2026-10-24 01:53:45.211522+00'::timestamptz),
  ('first-basket-research:v3:pregame:21717945','2026-10-24 01:39:15.280493+00'::timestamptz),
  ('scouting:v1:21717945:2026-10-23','2026-10-23 12:51:47.122774+00'::timestamptz),
  ('scouting:v1:21717946:2026-10-24','2026-10-24 21:51:59.280034+00'::timestamptz),
  ('scouting:v1:21717947:2026-10-24','2026-10-24 18:45:36.944543+00'::timestamptz),
  ('scouting:v1:21717948:2026-10-24','2026-10-24 18:24:40.154099+00'::timestamptz),
  ('scouting:v1:21717949:2026-10-24','2026-10-24 19:08:12.576888+00'::timestamptz),
  ('tracking:v1:21717944:2026-10-23','2026-10-23 23:03:26.192725+00'::timestamptz),
  ('tracking:v1:21717945:2026-10-23','2026-10-24 01:39:27.535599+00'::timestamptz),
  ('tracking:v1:21717947:2026-10-24','2026-10-24 23:10:07.007758+00'::timestamptz),
  ('tracking:v1:21717948:2026-10-24','2026-10-24 23:12:27.147602+00'::timestamptz),
  ('first-basket-research:v3:pregame:21717954','2026-10-25 01:53:15.200961+00'::timestamptz),
  ('scouting:v1:21717950:2026-10-24','2026-10-24 21:45:56.842527+00'::timestamptz),
  ('scouting:v1:21717951:2026-10-24','2026-10-24 18:43:51.236094+00'::timestamptz),
  ('scouting:v1:21717953:2026-10-24','2026-10-24 18:44:48.23251+00'::timestamptz),
  ('scouting:v1:21717954:2026-10-24','2026-10-25 00:59:54.973193+00'::timestamptz),
  ('tracking:v1:21717949:2026-10-24','2026-10-25 00:29:34.701196+00'::timestamptz),
  ('tracking:v1:21717951:2026-10-24','2026-10-24 23:12:31.012888+00'::timestamptz),
  ('scouting:v1:21717860:2026-10-22','2026-10-22 21:27:43.337977+00'::timestamptz),
  ('tracking:v1:21717859:2026-10-20','2026-10-20 17:45:33.461139+00'::timestamptz),
  ('scouting:v1:21717861:2026-10-22','2026-10-23 00:14:09.905245+00'::timestamptz),
  ('tracking:v1:21717860:2026-10-20','2026-10-20 17:45:50.026354+00'::timestamptz),
  ('scouting:v1:21717862:2026-10-23','2026-10-23 21:55:56.103817+00'::timestamptz),
  ('tracking:v1:21717861:2026-10-20','2026-10-20 17:45:59.045194+00'::timestamptz),
  ('scouting:v1:21717863:2026-10-23','2026-10-23 12:48:57.004531+00'::timestamptz),
  ('tracking:v1:21717862:2026-10-20','2026-10-20 17:46:17.325283+00'::timestamptz),
  ('first-basket-research:v2:21717922','2026-10-20 15:56:55.972101+00'::timestamptz),
  ('tracking:v1:21717863:2026-10-23','2026-10-23 18:05:32.85703+00'::timestamptz),
  ('scouting:v1:21717922:2026-10-21','2026-10-21 22:58:04.81286+00'::timestamptz),
  ('tracking:v1:21717922:2026-10-21','2026-10-21 21:14:48.287823+00'::timestamptz),
  ('scouting:v1:21717923:2026-10-21','2026-10-21 22:41:10.389652+00'::timestamptz),
  ('tracking:v1:21717923:2026-10-21','2026-10-21 21:11:49.796586+00'::timestamptz),
  ('scouting:v1:21717924:2026-10-21','2026-10-21 17:33:30.253075+00'::timestamptz),
  ('tracking:v1:21717924:2026-10-21','2026-10-21 23:16:58.462362+00'::timestamptz),
  ('scouting:v1:21717926:2026-10-21','2026-10-21 23:19:02.563278+00'::timestamptz),
  ('tracking:v1:21717926:2026-10-21','2026-10-21 21:14:55.138127+00'::timestamptz),
  ('scouting:v1:21717927:2026-10-21','2026-10-21 22:30:50.970665+00'::timestamptz),
  ('tracking:v1:21717927:2026-10-21','2026-10-21 21:14:56.127868+00'::timestamptz)
), cutoffs as materialized (
  select game_id,min(tipoff_at) tipoff_at from (
    select game_id,tipoff_at from public.nba_odds_phase_games
    union all
    select game_id,tipoff_at from public.nba_pregame_research
    where resource='board:v1' and version=1 and observed_at<tipoff_at
  ) clocks where isfinite(tipoff_at) group by game_id
),
originals as materialized (
  select e.source_key,e.source_observed_at,c.payload,
    case when e.source_key ~ '^scouting:v1:[0-9]+:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then 'scouting:v1'
      when e.source_key ~ '^tracking:v1:[0-9]+:[0-9]{4}-[0-9]{2}-[0-9]{2}$' then 'tracking:v1'
      when e.source_key ~ '^first-basket-research:(v2:[0-9]+|v3:pregame:[0-9]+)$' then 'first-basket:v1' end resource,
    substring(e.source_key from '(?:scouting:v1:|tracking:v1:|first-basket-research:v2:|first-basket-research:v3:pregame:)([0-9]+)')::bigint game_id
  from expected e left join public.nba_source_cache c on c.key=e.source_key and c.fetched_at=e.source_observed_at
), inspected as materialized (
  select o.*,k.tipoff_at,
    case when o.payload is null then 'source_missing_or_changed'
      when o.resource is null then 'unsupported_source_key'
      when k.tipoff_at is null then 'missing_canonical_tip'
      when o.source_observed_at>=k.tipoff_at or o.source_observed_at>clock_timestamp() then 'not_pregame'
      when octet_length(o.payload::text)>8388608 then 'payload_too_large'
      when o.resource='scouting:v1' and not coalesce(jsonb_typeof(o.payload->'players')='array' and jsonb_typeof(o.payload->'issues')='array' and o.payload->'issues'='[]'::jsonb,false) then 'incomplete_scouting'
      when o.resource='tracking:v1' and not coalesce(o.payload->>'gameId'=o.game_id::text and o.payload->>'complete'='true' and jsonb_typeof(o.payload->'rows')='array' and jsonb_typeof(o.payload->'fields')='array',false) then 'incomplete_tracking'
      when o.resource='first-basket:v1' and not coalesce(o.payload->>'failed'='0' and o.payload->>'requestedGames'=o.payload->>'coveredGames' and jsonb_typeof(o.payload->'rows')='array' and jsonb_typeof(o.payload->'teams')='array',false) then 'incomplete_first_basket'
      else 'eligible' end status
  from originals o left join cutoffs k using(game_id)
), candidates as materialized (
  select distinct on(game_id,resource) game_id,resource,tipoff_at,source_observed_at observed_at,source_key,payload
  from inspected where status='eligible' order by game_id,resource,source_observed_at desc,source_key
),
inserted as (
  insert into public.nba_pregame_research(game_id,resource,version,tipoff_at,observed_at,source,source_key,payload)
  select game_id,resource,1,tipoff_at,observed_at,'recovered-cache',source_key,payload from candidates
  where not exists(select 1 from inspected where status='source_missing_or_changed')
  on conflict(game_id,resource,version) do nothing
  returning game_id,resource,observed_at,source_key
)
select jsonb_build_object('inserted',(select count(*) from inserted),'source_changed_abort',(select count(*) from inspected where status='source_missing_or_changed'),
  'resources',(select jsonb_agg(x) from (select resource,count(*) count from inserted group by resource order by resource) x));
commit;

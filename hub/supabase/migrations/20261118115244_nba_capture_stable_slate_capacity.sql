-- Keep daily capacity stable as earlier games finish; completed games remain
-- part of the day's slate capacity. Individual launch eligibility still rejects
-- started games in nba_pregame_pick_admission_due.
do $guard$ begin
 if md5(pg_get_functiondef('public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,uuid,bigint[])'::regprocedure))<>'e5023a916e777cdbad80670e6d638b9a'
 then raise exception 'Live public capture capacity changed'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.apply_browserbase_shared_budget(p_project text, p_period uuid, p_id uuid, p_timeout_seconds integer, p_minutes numeric, p_bytes bigint, p_observed_at timestamp with time zone, p_monitor_id uuid, p_public_games bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '2s'
 SET statement_timeout TO '5s'
AS $function$
declare
  s public.browserbase_shared_budget_state%rowtype;
  now_at timestamptz;
  cost bigint;
  debit integer;
  recovery_id uuid;
  recovery_cutoff timestamptz;
  ceiling integer;
  public_session_limit integer;
  use_pregame_pick_admission boolean := false;
  nfl_public_pick_cutoff timestamptz;
  nfl_fanduel_cutoff timestamptz;
begin
  if p_project is null or p_project !~ '^[A-Za-z0-9_-]{1,128}$' or p_period is null
    or p_minutes is null or p_minutes not between 0 and 1000000000
    or p_bytes is null or p_bytes not between 0 and 1000000000000000
    or p_observed_at is null or not pg_catalog.isfinite(p_observed_at)
    or (p_id is null and p_timeout_seconds is not null)
    or (p_id is not null and (p_timeout_seconds is null or p_timeout_seconds not between 60 and 450))
  then raise exception 'Invalid admission request'; end if;
  select * into s from public.browserbase_shared_budget_state where project_id=p_project for update;
  if not found or s.period_id<>p_period then return jsonb_build_object('allowed',false,'reason','baseline-unavailable'); end if;
  now_at:=clock_timestamp();
  -- The public pick exception is attached to the reservation and usable by
  -- that session's monitor after the old spending period has ended.
  if p_id is null then
    select exists (
      select 1 from public.browserbase_shared_budget_reservations r
      where r.reservation_id=p_monitor_id and r.project_id=p_project and r.period_id=p_period
        and r.nba_pregame_pick_admission and r.nba_enabled and r.nba_workflow='public'
    ) into use_pregame_pick_admission;
  elsif p_public_games is not null and p_timeout_seconds<=300 then
    use_pregame_pick_admission := public.nba_pregame_pick_admission_due(p_public_games, now_at);
  end if;
  if p_id is null then
    select r.nfl_public_pick_cutoff,r.nfl_fanduel_cutoff into nfl_public_pick_cutoff,nfl_fanduel_cutoff
    from public.browserbase_shared_budget_reservations r
    where r.reservation_id=p_monitor_id and r.project_id=p_project and r.period_id=p_period
      and r.nba_enabled is false;
  elsif p_public_games is null and exists (
    select 1 from public.nba_source_cache c where c.key='nfl:browser:v1:public-batch:'||p_id::text
  ) then
    nfl_public_pick_cutoff:=public.nfl_public_pick_batch_cutoff(p_id,now_at);
    if p_timeout_seconds>300 or nfl_public_pick_cutoff is null
      or now_at+make_interval(secs=>p_timeout_seconds+30)>=nfl_public_pick_cutoff then
      return jsonb_build_object('allowed',false,'reason','spend-limit');
    end if;
  elsif p_public_games is null and exists (
    select 1 from public.nba_source_cache c where c.key='nfl:browser:v1:fanduel-batch:'||p_id::text
  ) then
    nfl_fanduel_cutoff:=public.nfl_fanduel_batch_cutoff(p_id,now_at);
    if nfl_fanduel_cutoff is null or now_at+make_interval(secs=>p_timeout_seconds+30)>=nfl_fanduel_cutoff then
      return jsonb_build_object('allowed',false,'reason','spend-limit');
    end if;
  end if;
  if now_at<s.starts_at or (now_at>=s.ends_at and not use_pregame_pick_admission
      and nfl_public_pick_cutoff is null and nfl_fanduel_cutoff is null) then
    return jsonb_build_object('allowed',false,'reason','period-closed');
  end if;
  if p_observed_at>now_at or p_observed_at<now_at-interval '30 seconds' then return jsonb_build_object('allowed',false,'reason','usage-unavailable'); end if;
  if p_observed_at<s.last_observed_at or (p_observed_at=s.last_observed_at and (p_bytes<s.last_bytes or p_minutes<s.last_minutes))
    then return jsonb_build_object('allowed',false,'reason','usage-reordered'); end if;
  if p_bytes<s.last_bytes or p_minutes<s.last_minutes then return jsonb_build_object('allowed',false,'reason','usage-unavailable'); end if;
  -- Baseline is deliberately subtracted only when explicitly provisioned;
  -- every post-baseline byte/minute is treated as billable. All reservations
  -- remain additive even after usage reports may already include them.
  cost:=pg_catalog.ceil((p_bytes-s.baseline_bytes)::numeric/1000000 + (p_minutes-s.baseline_minutes)/6)::bigint;
  update public.browserbase_shared_budget_state set last_bytes=p_bytes,last_minutes=p_minutes,last_observed_at=p_observed_at where project_id=p_project;
  ceiling:=s.ceiling_cents;
  recovery_id:=coalesce(p_id,p_monitor_id);
  if exists(select 1 from public.nfl_nov8_browserbase_plans() where id=recovery_id) then
    recovery_cutoff:=public.nfl_nov8_browserbase_cutoff(recovery_id,
      case when p_id is not null then p_timeout_seconds else
        (select timeout_seconds from public.browserbase_shared_budget_reservations
          where reservation_id=p_monitor_id and project_id=p_project and period_id=p_period and nba_enabled=false)
      end);
    if p_period<>'6391f791-c131-436b-9858-6e0de67a2af1'::uuid
      or now_at<'2026-11-08T17:30:00Z'::timestamptz or recovery_cutoff is null
      or now_at+make_interval(secs=>case when p_id is null then 0 else p_timeout_seconds+30 end)>=recovery_cutoff
    then return jsonb_build_object('allowed',false,'reason','spend-limit'); end if;
    if recovery_id='8e50f012-0ed0-4592-aaa3-cdb977a1c0d9'::uuid then
      if now_at<'2026-11-09T23:20:00Z'::timestamptz or (p_id is not null and exists (
        select 1 from public.nfl_pikkit_picks_snapshot_history
        where game_id='2026_09_BUF_MIN' and captured_at>='2026-11-09T23:20:00Z'::timestamptz
      )) then return jsonb_build_object('allowed',false,'reason','spend-limit'); end if;
      ceiling:=ceiling+800;
    else
      ceiling:=ceiling+600;
    end if;
  end if;
  if p_id is null then
    if coalesce(nfl_public_pick_cutoff,nfl_fanduel_cutoff) is not null then
      return jsonb_build_object('allowed',now_at<coalesce(nfl_public_pick_cutoff,nfl_fanduel_cutoff),'reason','checked','floorCents',cost+s.reserved_cents);
    end if;
    if use_pregame_pick_admission then
      return jsonb_build_object('allowed',true,'reason','checked','floorCents',cost+s.reserved_cents);
    end if;
    if exists (
      select 1 from public.browserbase_shared_budget_reservations r
      where r.reservation_id=p_monitor_id and r.project_id=p_project and r.period_id=p_period
        and r.nba_public_headroom and r.nba_enabled and r.nba_workflow='public'
    ) then ceiling:=s.ceiling_cents+1500; end if;
    return jsonb_build_object('allowed',cost+s.reserved_cents<=ceiling,'reason','checked','floorCents',cost+s.reserved_cents);
  end if;
  if exists(select 1 from public.browserbase_shared_budget_reservations where reservation_id=p_id) then
    return jsonb_build_object('allowed',false,'reason','duplicate');
  end if;
  -- Only pending is provably pre-create. The caller must atomically mark
  -- creating before sending the SDK POST; a late caller can no longer do so
  -- after this CAS cleanup, so abandoned lost-response reservations can recover
  -- without a refund. Creating/active/closing never clear by time alone.
  update public.browserbase_shared_budget_reservations set status='closed',closed_at=now_at
    where project_id=p_project and status='pending' and created_at<now_at-interval '60 seconds';
  -- Every unresolved reservation blocks every further launch, across periods.
  -- The runtime clears attempted creates only after exact remote completion.
  if exists(select 1 from public.browserbase_shared_budget_reservations r where r.project_id=p_project
    and r.status<>'closed')
    then return jsonb_build_object('allowed',false,'reason','session-unverified'); end if;
  -- An estimate, not a hard per-session byte limit.
  debit:=50+pg_catalog.ceil(p_timeout_seconds::numeric/360)::integer;
  if use_pregame_pick_admission then
    -- Failed and ambiguous launches count too. The project row lock above
    -- serializes the Eastern slate-day limit with all other launch attempts.
    -- Capacity scales with scheduled games, not a six-session cliff. Normal
    -- per-game checkpoint/backoff controls still decide which games are due.
    -- Count this slate and the next day's baseline work; never exceed 60/day.
    select greatest(8,least(60,4*count(distinct g.id)::integer)) into public_session_limit
     from public.nba_games g
     where (g.payload->>'datetime')::timestamptz>=date_trunc('day',now_at,'America/New_York')
      and (g.payload->>'datetime')::timestamptz<date_trunc('day',now_at,'America/New_York')+interval '48 hours';
    if (
      select count(*) from public.browserbase_shared_budget_reservations r
      where r.project_id=p_project and r.created_at>=date_trunc('day',now_at,'America/New_York')
        and (r.nba_pregame_pick_admission or r.nba_enabled and r.nba_workflow='public')
    )>=public_session_limit then
      return jsonb_build_object('allowed',false,'reason','daily-session-limit');
    end if;
  elsif nfl_public_pick_cutoff is not null then
    -- The shared state lock above serializes this limit and counts ambiguous launches.
    if (
      select count(*) from public.browserbase_shared_budget_reservations r
      where r.project_id=p_project and r.nfl_public_pick_cutoff is not null
        and r.created_at>=date_trunc('day',now_at,'America/New_York')
    )>=12 then
      return jsonb_build_object('allowed',false,'reason','daily-session-limit');
    end if;
  elsif nfl_fanduel_cutoff is not null then
    if (
      select count(*) from public.browserbase_shared_budget_reservations r
      where r.project_id=p_project and r.nfl_fanduel_cutoff is not null
        and r.created_at>=date_trunc('day',now_at,'America/New_York')
    )>=16 then
      return jsonb_build_object('allowed',false,'reason','daily-session-limit');
    end if;
  elsif cost+s.reserved_cents+debit>ceiling then
    return jsonb_build_object('allowed',false,'reason','spend-limit');
  end if;
  update public.browserbase_shared_budget_state set reserved_cents=reserved_cents+debit where project_id=p_project;
  insert into public.browserbase_shared_budget_reservations(reservation_id,project_id,period_id,reserved_cents,timeout_seconds,nba_pregame_pick_admission,nfl_public_pick_cutoff,nfl_fanduel_cutoff)
    values(p_id,p_project,p_period,debit,p_timeout_seconds,use_pregame_pick_admission,nfl_public_pick_cutoff,nfl_fanduel_cutoff);
  return jsonb_build_object('allowed',true,'reason','reserved','id',p_id,'reservedCents',debit,'floorCents',cost+s.reserved_cents+debit);
end $function$
;

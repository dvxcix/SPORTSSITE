-- Repair duplicate targets in the NFL touchdown baseline rebuild.
set local lock_timeout='3s';
do $guard$
begin
  if md5(pg_get_functiondef('public.refresh_nfl_td_baselines(date[])'::regprocedure)) is distinct from '190aa7a19fecf388e3a6acb520ca65f0'
  then raise exception 'Unexpected NFL baseline function'; end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.refresh_nfl_td_baselines(p_dates date[])
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  affected integer;
  target_date date;
begin
  -- Concurrent schedules may touch the same dates. Lock in stable date order.
  for target_date in select distinct d from unnest(p_dates) as t(d) where d is not null order by d loop
    perform pg_advisory_xact_lock(hashtextextended('nfl-td-baseline:'||target_date::text,0));
  end loop;
  delete from public.nfl_td_baseline_daily where slate_date = any(p_dates);

  insert into public.nfl_td_baseline_daily (
    slate_date, player_id, player_name, team_abbr, vendor, prop_type,
    average_odds, average_implied_probability, sample_games,
    first_sample_date, through_date, computed_at
  )
  with targets as (
    -- One target per persisted key. Conflicting upstream team assignments
    -- are left without a baseline until the identity is resolved.
    select slate_date, player_id, min(player_name) as player_name, min(team_abbr) as team_abbr, vendor, prop_type
    from public.nfl_player_market_daily
    where slate_date = any(p_dates)
      and prop_type in ('anytime_td', 'first_td')
    group by slate_date, player_id, vendor, prop_type
    having count(distinct team_abbr)=1
  ), histories as (
    select
      target.*,
      history.slate_date as history_date,
      history.implied_probability
    from targets target
    cross join lateral (
      select
        prior.slate_date,
        case
          when coalesce(prior.opening_odds, prior.current_odds) < 0 then
            (-coalesce(prior.opening_odds, prior.current_odds)::numeric)
              / ((-coalesce(prior.opening_odds, prior.current_odds)::numeric) + 100)
          when coalesce(prior.opening_odds, prior.current_odds) > 0 then
            100 / (coalesce(prior.opening_odds, prior.current_odds)::numeric + 100)
          else null
        end as implied_probability
      from public.nfl_player_market_daily prior
      where prior.player_id = target.player_id
        and prior.vendor = target.vendor
        and prior.prop_type = target.prop_type
        and prior.market_type = 'milestone'
        and prior.slate_date < target.slate_date
        and coalesce(prior.opening_odds, prior.current_odds) is not null
        and coalesce(prior.opening_odds, prior.current_odds) <> 0
      order by prior.slate_date desc
      limit 20
    ) history
  ), aggregated as (
    select
      slate_date, player_id, player_name, team_abbr, vendor, prop_type,
      avg(implied_probability) as average_probability,
      count(*)::integer as sample_games,
      min(history_date) as first_sample_date,
      max(history_date) as through_date
    from histories
    where implied_probability is not null
    group by slate_date, player_id, player_name, team_abbr, vendor, prop_type
  )
  select
    slate_date, player_id, player_name, team_abbr, vendor, prop_type,
    case
      when average_probability >= 0.5 then -100 * average_probability / (1 - average_probability)
      else 100 * (1 - average_probability) / average_probability
    end,
    average_probability,
    sample_games,
    first_sample_date,
    through_date,
    now()
  from aggregated;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

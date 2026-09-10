-- Remove only consecutive, byte-equivalent historical boards. This keeps
-- the first capture and every genuine transition (including A -> B -> A),
-- which is exactly the sequence consumed by Market Story.
create table if not exists private.history_compaction_state (
  job_name text primary key,
  cursor_date date,
  rows_removed bigint not null default 0,
  updated_at timestamptz not null default now()
);

revoke all on table private.history_compaction_state from public, anon, authenticated;

insert into private.history_compaction_state (job_name, cursor_date)
select
  'pregame_odds_snapshot_history',
  min(game_date)
from public.pregame_odds_snapshot_history
where game_date <= current_date - 2
on conflict (job_name) do nothing;

create or replace function private.compact_pregame_odds_history_batch(p_batch_size integer default 5000)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $function$
declare
  target_date date;
  removed_count integer := 0;
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 5000), 5000));
begin
  if not pg_try_advisory_xact_lock(hashtext('private.compact_pregame_odds_history_batch')) then
    return 0;
  end if;

  select cursor_date
  into target_date
  from private.history_compaction_state
  where job_name = 'pregame_odds_snapshot_history'
  for update;

  if target_date is null or target_date > current_date - 2 then
    return 0;
  end if;

  with ordered as materialized (
    select
      id,
      prop_map,
      lag(prop_map) over (partition by game_pk order by captured_at, id) as previous_prop_map
    from public.pregame_odds_snapshot_history
    where game_date = target_date
  ), doomed as (
    select id
    from ordered
    where prop_map = previous_prop_map
    order by id
    limit safe_batch_size
  )
  delete from public.pregame_odds_snapshot_history history
  using doomed
  where history.id = doomed.id;

  get diagnostics removed_count = row_count;

  if removed_count = 0 then
    select min(game_date)
    into target_date
    from public.pregame_odds_snapshot_history
    where game_date > target_date
      and game_date <= current_date - 2;
  end if;

  update private.history_compaction_state
  set cursor_date = target_date,
      rows_removed = rows_removed + removed_count,
      updated_at = now()
  where job_name = 'pregame_odds_snapshot_history';

  return removed_count;
end;
$function$;

revoke all on function private.compact_pregame_odds_history_batch(integer) from public, anon, authenticated;

-- Let Postgres make deleted history space reusable promptly instead of
-- waiting for the default 20% dead-row threshold on multi-million-row
-- tables. ANALYZE more frequently on the large pitch table as well.
alter table public.pregame_odds_snapshot_history set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 5000,
  autovacuum_analyze_scale_factor = 0.02
);
alter table public.player_pitch_log_2026 set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- Cover the three NFL Matrix foreign keys flagged by the database advisor.
create index if not exists nfl_matrix_marketplace_imports_imported_matrix_idx
  on public.nfl_matrix_marketplace_imports (imported_matrix_id);
create index if not exists nfl_matrix_marketplace_imports_user_idx
  on public.nfl_matrix_marketplace_imports (user_id);
create index if not exists nfl_matrix_marketplace_listings_source_matrix_idx
  on public.nfl_matrix_marketplace_listings (source_matrix_id);

do $block$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'compact-pregame-odds-history'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'compact-pregame-odds-history',
    '17 */2 * * *',
    $cron$select private.compact_pregame_odds_history_batch(5000);$cron$
  );
end;
$block$;

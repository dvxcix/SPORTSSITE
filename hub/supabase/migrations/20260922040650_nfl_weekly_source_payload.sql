alter table public.nfl_player_stats add column if not exists raw jsonb;
comment on column public.nfl_player_stats.raw is 'Unmodified weekly provider row, retaining advanced/defensive/kicking fields beyond typed UI columns.';

alter table public.picks
  add column if not exists player_id text,
  add column if not exists market_side text,
  add column if not exists numeric_line numeric;

create index if not exists picks_nfl_pending_game_idx
  on public.picks (game_pk, player_id)
  where sport = 'NFL' and result = 'pending';

comment on column public.picks.player_id is 'Sport-native player identifier. MLB continues to use mlb_id; NFL uses GSIS id when available.';
comment on column public.picks.market_side is 'milestone, over, or under for structured market settlement.';
comment on column public.picks.numeric_line is 'Unformatted threshold used for deterministic settlement.';

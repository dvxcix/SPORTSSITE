create table public.fanduel_market_captures (
  capture_key text primary key,
  game_date date not null,
  game_key text not null,
  sportsbook text not null default 'FanDuel',
  event_id text,
  event_title text,
  event_slug text,
  event_url text,
  tab_label text not null,
  scraped_at timestamptz not null,
  imported_at timestamptz not null default now(),
  section_count integer not null default 0 check (section_count >= 0),
  outcome_count integer not null default 0 check (outcome_count >= 0),
  raw_sections jsonb not null default '{}'::jsonb,
  source text not null default 'browserbase'
);

create table public.fanduel_market_outcomes (
  outcome_key text primary key,
  capture_key text not null references public.fanduel_market_captures(capture_key) on delete cascade,
  game_date date not null,
  game_key text not null,
  tab_label text not null,
  section_name text not null,
  market_hint text,
  selection text not null,
  selection_norm text not null,
  odds integer not null,
  odds_raw text not null,
  parts jsonb not null default '[]'::jsonb,
  aria_label text,
  outcome_format text,
  scraped_at timestamptz not null,
  imported_at timestamptz not null default now()
);

create index fanduel_market_captures_game_time_idx
  on public.fanduel_market_captures (game_date, game_key, scraped_at desc);
create index fanduel_market_captures_event_idx
  on public.fanduel_market_captures (event_id, scraped_at desc)
  where event_id is not null;
create index fanduel_market_captures_scraped_brin_idx
  on public.fanduel_market_captures using brin (scraped_at);

create index fanduel_market_outcomes_game_market_time_idx
  on public.fanduel_market_outcomes (game_date, game_key, section_name, scraped_at desc);
create index fanduel_market_outcomes_selection_time_idx
  on public.fanduel_market_outcomes (selection_norm, scraped_at desc);
create index fanduel_market_outcomes_hint_time_idx
  on public.fanduel_market_outcomes (market_hint, scraped_at desc)
  where market_hint is not null;
create index fanduel_market_outcomes_capture_idx
  on public.fanduel_market_outcomes (capture_key);
create index fanduel_market_outcomes_scraped_brin_idx
  on public.fanduel_market_outcomes using brin (scraped_at);

alter table public.fanduel_market_captures enable row level security;
alter table public.fanduel_market_outcomes enable row level security;

revoke all on table public.fanduel_market_captures from public, anon, authenticated;
revoke all on table public.fanduel_market_outcomes from public, anon, authenticated;
grant select, insert, update, delete on table public.fanduel_market_captures to service_role;
grant select, insert, update, delete on table public.fanduel_market_outcomes to service_role;

comment on table public.fanduel_market_captures is
  'Lossless server-only archive of each FanDuel event tab capture before market reduction.';
comment on table public.fanduel_market_outcomes is
  'Queryable server-only FanDuel outcomes retained across every tab and market.';

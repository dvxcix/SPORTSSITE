-- Source-separated feeds. Raw event IDs must never be mixed with nflverse play IDs.
create table public.nfl_game_feeds (
 game_id text not null references public.nfl_schedule(game_id),
 source text not null check (source in ('bdl_plays','snap_counts','ftn_charting')),
 season integer not null,
 row_count integer not null check(row_count >= 0),
 payload jsonb not null,
 source_updated_at timestamptz,
 fetched_at timestamptz not null default now(),
 reconciled boolean not null default false,
 primary key(game_id,source)
);
alter table public.nfl_game_feeds enable row level security;
revoke all on public.nfl_game_feeds from anon, authenticated;
grant select,insert,update on public.nfl_game_feeds to service_role;
create index nfl_game_feeds_season_source on public.nfl_game_feeds(season,source);
comment on table public.nfl_game_feeds is 'Source-separated event, snap and charting observations. Reconciled means source-specific checks passed, not complete advanced tracking.';

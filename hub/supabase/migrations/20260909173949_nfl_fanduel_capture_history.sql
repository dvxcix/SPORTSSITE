create table public.nfl_fanduel_capture_history (
 game_id text not null references public.nfl_schedule(game_id),
 captured_at timestamptz not null,
 board jsonb not null,
 raw_tabs jsonb not null,
 primary key (game_id,captured_at)
);
alter table public.nfl_fanduel_capture_history enable row level security;
revoke all on public.nfl_fanduel_capture_history from public,anon,authenticated;
grant select,insert on public.nfl_fanduel_capture_history to service_role;

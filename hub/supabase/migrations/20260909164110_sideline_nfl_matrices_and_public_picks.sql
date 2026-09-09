create table if not exists public.nfl_matrices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 80),
 color text not null default '#a7ff3f' check (color ~ '^#[0-9a-fA-F]{6}$'),
 enabled boolean not null default true,
 match_mode text not null default 'all' check (match_mode in ('all','any')),
 rules jsonb not null check (jsonb_typeof(rules)='array' and jsonb_array_length(rules) between 1 and 40),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists nfl_matrices_owner_idx on public.nfl_matrices(user_id);
alter table public.nfl_matrices enable row level security;
revoke all on public.nfl_matrices from anon, authenticated;
grant select,insert,update,delete on public.nfl_matrices to authenticated;
grant all on public.nfl_matrices to service_role;
create policy nfl_matrices_owner on public.nfl_matrices for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table if not exists public.nfl_public_picks (
 game_id text not null references public.nfl_schedule(game_id),
 player_name text not null,
 market text not null,
 picks integer not null check(picks>=0),
 captured_at timestamptz not null default now(),
 primary key (game_id,player_name,market)
);
alter table public.nfl_public_picks enable row level security;
revoke all on public.nfl_public_picks from anon,authenticated;
grant all on public.nfl_public_picks to service_role;

create table if not exists public.nfl_public_pick_history (
 id bigint generated always as identity primary key,
 game_id text not null references public.nfl_schedule(game_id),
 props jsonb not null,
 captured_at timestamptz not null default now()
);
create index if not exists nfl_pick_history_game_time_idx on public.nfl_public_pick_history(game_id,captured_at desc);
alter table public.nfl_public_pick_history enable row level security;
revoke all on public.nfl_public_pick_history from anon,authenticated;
grant all on public.nfl_public_pick_history to service_role;
grant usage,select on sequence public.nfl_public_pick_history_id_seq to service_role;

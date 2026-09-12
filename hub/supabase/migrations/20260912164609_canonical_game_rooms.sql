create table if not exists public.game_room_messages (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('mlb', 'nfl', 'nba', 'nhl', 'soccer')),
  game_id text not null check (char_length(game_id) between 1 and 80),
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists game_room_messages_room_time_idx
  on public.game_room_messages (sport, game_id, created_at desc);
create index if not exists game_room_messages_user_idx
  on public.game_room_messages (user_id, created_at desc);

alter table public.game_room_messages enable row level security;

create policy "Game rooms are readable"
  on public.game_room_messages for select
  using (true);

create policy "Members post to game rooms"
  on public.game_room_messages for insert
  with check (
    user_id = (select auth.uid())
    and private.check_rate_limit('game-room:' || user_id::text, 30, 60)
  );

create policy "Members edit own game room messages"
  on public.game_room_messages for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Members delete own game room messages"
  on public.game_room_messages for delete
  using (user_id = (select auth.uid()));

grant select on public.game_room_messages to anon, authenticated;
grant insert, update, delete on public.game_room_messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_room_messages'
  ) then
    alter publication supabase_realtime add table public.game_room_messages;
  end if;
end $$;
